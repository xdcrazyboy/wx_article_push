const NTFY_TOPIC = "wechat-push-bobo-xxoo-2026-05-17";
const LOCAL_POLL = "http://localhost:8765/poll";
const ROOT_FOLDER = "微信文章";
const SAVED_URLS_KEY = "savedUrls";

// ── 生命周期 ───────────────────────────────────────
chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.local.set({ enabled: true, ntfyConnected: false, savedUrls: {} });
  setup();
});

chrome.runtime.onStartup.addListener(setup);

chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === "localPoll") localPoll();
  if (alarm.name === "keepAlive") keepAlive();
});

function setup() {
  chrome.alarms.getAll(function(alarms) {
    var names = alarms.map(function(a) { return a.name; });
    if (names.indexOf("localPoll") === -1) {
      chrome.alarms.create("localPoll", { periodInMinutes: 3 });
    }
    if (names.indexOf("keepAlive") === -1) {
      chrome.alarms.create("keepAlive", { periodInMinutes: 1 });
    }
  });
  connectNtfy();
}

function keepAlive() {
  chrome.storage.local.get("ntfyConnected", function(d) {
    if (!d.ntfyConnected) {
      console.log("[keepAlive] 重连ntfy...");
      connectNtfy();
    }
  });
}

// ── 从标签页提取微信文章元数据 ────────────────────
// 在页面真实环境里执行，能拿到完整DOM，解决fetch跨域/重定向问题
function extractMetaFromPage() {
  function getText(selector) {
    var el = document.querySelector(selector);
    return el ? el.textContent.trim().replace(/\s+/g, " ") : null;
  }
  // 标题：优先 js_title_inner，其次 activity-name 去掉子元素干扰
  var titleEl = document.querySelector(".js_title_inner") || document.querySelector("#activity-name");
  var title = titleEl ? titleEl.textContent.trim().replace(/\s+/g, " ") : null;

  // 公众号名：#js_name 内文本
  var accountEl = document.querySelector("#js_name");
  var account = accountEl ? accountEl.textContent.trim().replace(/\s+/g, " ") : null;

  // 作者：取可见的 js_author_name*
  var author = null;
  var spans = document.querySelectorAll('[id^="js_author_name"]');
  for (var i = 0; i < spans.length; i++) {
    var s = spans[i];
    if (s.offsetParent !== null && s.style.display !== "none") {
      author = s.textContent.trim().replace(/\s+/g, " ");
      break;
    }
  }
  if (!author && spans.length > 0) {
    author = spans[0].textContent.trim().replace(/\s+/g, " ");
  }

  return {
    title: title,
    account: account,
    author: author,
    publishTime: getText("#publish_time"),
  };
}

function fetchWechatMeta(url, tabId) {
  // 如果有 tabId，直接在页面里执行脚本提取
  if (tabId) {
    return new Promise(function(resolve) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: extractMetaFromPage,
      }, function(results) {
        if (chrome.runtime.lastError) {
          console.log("[meta] 脚本注入失败:", chrome.runtime.lastError.message);
          resolve({ title: null, account: null, author: null, publishTime: null });
          return;
        }
        var meta = results && results[0] && results[0].result;
        console.log("[meta] 页面提取:", JSON.stringify(meta));
        resolve(meta || { title: null, account: null, author: null, publishTime: null });
      });
    });
  }
  // 没有 tabId 时降级用 fetch（整理收藏夹时用）
  return new Promise(function(resolve) {
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, 8000);
    fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36" }
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      clearTimeout(timer);
      var meta = parseWechatHtml(html);
      console.log("[meta] fetch提取:", JSON.stringify(meta));
      resolve(meta);
    })
    .catch(function(e) {
      clearTimeout(timer);
      console.log("[meta] fetch失败:", e.message);
      resolve({ title: null, account: null, author: null, publishTime: null });
    });
  });
}

function parseWechatHtml(html) {
  function extractById(h, id, closeTag) {
    var re = new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)<\\/' + closeTag + '>', 'i');
    var m = h.match(re);
    return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
  }
  var titleMatch = html.match(/class="js_title_inner"[^>]*>([\s\S]*?)<\/span>/i);
  var title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : null;
  var account = extractById(html, "js_name", "a");
  var author = null;
  var block = html.match(/id="meta_content"[\s\S]*?id="profileBt"/);
  if (block) {
    var spanRe = /(<span[^>]*id="js_author_name[^"]*"[^>]*>)([\s\S]*?)<\/span>/gi;
    var s;
    while ((s = spanRe.exec(block[0])) !== null) {
      if (s[1].indexOf("display: none") === -1 && s[1].indexOf("display:none") === -1) {
        author = s[2].replace(/<[^>]+>/g, "").trim();
        break;
      }
    }
    if (!author) {
      spanRe.lastIndex = 0;
      s = spanRe.exec(block[0]);
      if (s) author = s[2].replace(/<[^>]+>/g, "").trim();
    }
  }
  var publishTime = extractById(html, "publish_time", "em");
  return { title: title, account: account, author: author, publishTime: publishTime };
}

// ── 书签工具函数 ───────────────────────────────────
function getRootFolderId() {
  return new Promise(function(resolve) {
    chrome.bookmarks.search({ title: ROOT_FOLDER }, function(results) {
      var folder = results && results.find(function(r) { return !r.url; });
      if (folder) {
        resolve(folder.id);
      } else {
        chrome.bookmarks.create({ parentId: "1", title: ROOT_FOLDER }, function(f) {
          resolve(f.id);
        });
      }
    });
  });
}

function getOrCreateFolder(parentId, name) {
  return new Promise(function(resolve) {
    chrome.bookmarks.getChildren(parentId, function(children) {
      // 找出所有同名文件夹
      var matches = children && children.filter(function(c) { return c.title === name && !c.url; });
      if (!matches || matches.length === 0) {
        // 不存在，创建
        chrome.bookmarks.create({ parentId: parentId, title: name }, function(folder) {
          resolve(folder.id);
        });
      } else if (matches.length === 1) {
        // 唯一，直接用
        resolve(matches[0].id);
      } else {
        // 有重复，合并到第一个，其余的内容移过来后删除
        var keepId = matches[0].id;
        var duplicates = matches.slice(1);
        var tasks = duplicates.map(function(dup) {
          return new Promise(function(res) {
            chrome.bookmarks.getChildren(dup.id, function(items) {
              if (!items || items.length === 0) {
                chrome.bookmarks.remove(dup.id, res);
                return;
              }
              var moveAll = items.map(function(item) {
                return new Promise(function(r) {
                  chrome.bookmarks.move(item.id, { parentId: keepId }, r);
                });
              });
              Promise.all(moveAll).then(function() {
                chrome.bookmarks.remove(dup.id, res);
              });
            });
          });
        });
        Promise.all(tasks).then(function() {
          console.log("[folder] 合并重复文件夹:", name);
          resolve(keepId);
        });
      }
    });
  });
}

// ── 去重：用 cleanUrl（去掉微信追踪参数）做 key ───
function getCleanUrl(url) {
  try {
    var u = new URL(url);
    // 策略1：有 __biz+mid+idx 时用这三个作为唯一标识
    if (u.searchParams.has("__biz") && u.searchParams.has("mid") && u.searchParams.has("idx")) {
      return u.searchParams.get("__biz") + "/" + u.searchParams.get("mid") + "/" + u.searchParams.get("idx");
    }
    // 策略2：有 sn 时用 sn（微信短链文章）
    if (u.searchParams.has("sn")) {
      return "sn/" + u.searchParams.get("sn");
    }
    // 策略3：用路径（去掉所有参数）
    return u.origin + u.pathname;
  } catch(e) {
    return url.split("?")[0];
  }
}

function isAlreadySaved(url) {
  var cleanUrl = getCleanUrl(url);
  return chrome.storage.local.get(SAVED_URLS_KEY).then(function(data) {
    var savedUrls = data.savedUrls || {};
    return !!savedUrls[cleanUrl];
  });
}

function markSaved(url) {
  var cleanUrl = getCleanUrl(url);
  return chrome.storage.local.get(SAVED_URLS_KEY).then(function(data) {
    var savedUrls = data.savedUrls || {};
    savedUrls[cleanUrl] = Date.now();
    var keys = Object.keys(savedUrls);
    if (keys.length > 1000) {
      keys.sort(function(a, b) { return savedUrls[a] - savedUrls[b]; })
          .slice(0, keys.length - 1000)
          .forEach(function(k) { delete savedUrls[k]; });
    }
    return chrome.storage.local.set({ savedUrls: savedUrls });
  });
}

// ── 收藏 + 打开 ────────────────────────────────────
function saveAndOpen(url) {
  return isAlreadySaved(url).then(function(dup) {
    if (dup) {
      console.log("[bookmark] 已存在，仅打开");
      chrome.tabs.create({ url: url, active: true });
      return;
    }
    // 先标记，防止重复触发
    return markSaved(url).then(function() {
      // 打开标签页，等页面加载完再提取元数据
      chrome.tabs.create({ url: url, active: true }, function(tab) {
        waitForTabLoad(tab.id).then(function() {
          return fetchWechatMeta(url, tab.id);
        }).then(function(meta) {
          var title = meta.title || url;
          var account = meta.account || "未知公众号";
          return getRootFolderId().then(function(rootId) {
            return getOrCreateFolder(rootId, account).then(function(folderId) {
              chrome.bookmarks.create({ parentId: folderId, title: title, url: url });
              console.log("[bookmark] 已收藏 [" + account + "] " + title);
              chrome.notifications.create({
                type: "basic",
                iconUrl: "icon.png",
                title: "已收藏·" + account,
                message: title.length > 50 ? title.slice(0, 50) + "…" : title,
              });
            });
          });
        }).catch(function(e) {
          console.log("[saveAndOpen] 元数据提取失败:", e.message);
          // 兜底：用URL作为标题存入未知公众号
          getRootFolderId().then(function(rootId) {
            return getOrCreateFolder(rootId, "未知公众号").then(function(folderId) {
              chrome.bookmarks.create({ parentId: folderId, title: url, url: url });
            });
          });
        });
      });
    });
  }).catch(function(e) {
    console.log("[saveAndOpen] 错误:", e.message);
    chrome.tabs.create({ url: url, active: true });
  });
}

// 等待标签页加载完成
function waitForTabLoad(tabId) {
  return new Promise(function(resolve) {
    function check() {
      chrome.tabs.get(tabId, function(tab) {
        if (chrome.runtime.lastError || !tab) { resolve(); return; }
        if (tab.status === "complete") {
          setTimeout(resolve, 1500); // 额外等1.5s确保微信页面JS渲染完
        } else {
          setTimeout(check, 300);
        }
      });
    }
    check();
  });
}

// ── 整理收藏夹 ─────────────────────────────────────
function getAllBookmarksInFolder(nodeId) {
  return new Promise(function(resolve) {
    chrome.bookmarks.getSubTree(nodeId, function(nodes) {
      var result = [];
      function walk(node) {
        if (node.url) result.push(node);
        else if (node.children) node.children.forEach(walk);
      }
      if (nodes && nodes[0]) walk(nodes[0]);
      resolve(result);
    });
  });
}

function delay(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

function organizeBookmarks() {
  return getRootFolderId().then(function(rootId) {
    return getAllBookmarksInFolder(rootId).then(function(bookmarks) {
      var total = bookmarks.length;
      var updated = 0;
      var i = 0;

      function processNext() {
        if (i >= bookmarks.length) {
          return cleanEmptyFolders(rootId).then(function() {
            return { total: total, updated: updated };
          });
        }
        var bm = bookmarks[i++];
        if (!bm.url || !bm.url.includes("mp.weixin.qq.com")) return processNext();

        return fetchWechatMeta(bm.url, null).then(function(meta) {
          var newTitle = meta.title || bm.title || bm.url;
          var newAccount = meta.account || "未知公众号";
          return getOrCreateFolder(rootId, newAccount).then(function(accountFolderId) {
            var titleChanged = newTitle && newTitle !== bm.title && newTitle !== bm.url;
            var folderChanged = bm.parentId !== accountFolderId;
            if (titleChanged || folderChanged) {
              return new Promise(function(resolve) {
                chrome.bookmarks.move(bm.id, { parentId: accountFolderId }, function() {
                  chrome.bookmarks.update(bm.id, { title: newTitle }, function() {
                    updated++;
                    console.log("[organize] 更新 [" + newAccount + "] " + newTitle);
                    resolve();
                  });
                });
              });
            }
          });
        }).catch(function(e) {
          console.log("[organize] 跳过:", bm.url, e.message);
        }).then(function() {
          return delay(800);
        }).then(processNext);
      }

      return processNext();
    });
  });
}

function cleanEmptyFolders(rootId) {
  return new Promise(function(resolve) {
    chrome.bookmarks.getChildren(rootId, function(children) {
      if (!children) { resolve(); return; }
      var tasks = children.filter(function(c) { return !c.url; }).map(function(child) {
        return new Promise(function(res) {
          chrome.bookmarks.getChildren(child.id, function(sub) {
            if (!sub || sub.length === 0) chrome.bookmarks.remove(child.id, res);
            else res();
          });
        });
      });
      Promise.all(tasks).then(resolve);
    });
  });
}

// ── ntfy 主动拉取 ──────────────────────────────────
function pullNtfy() {
  return chrome.storage.local.get("lastNtfyTime").then(function(data) {
    var since = data.lastNtfyTime ? Math.floor(data.lastNtfyTime / 1000) : "all";
    console.log("[pull] 主动拉取，since:", since);
    return fetch("https://ntfy.sh/" + NTFY_TOPIC + "/json?since=" + since + "&poll=1", {
      headers: { Accept: "application/x-ndjson" }
    })
    .then(function(res) { return res.text(); })
    .then(function(text) {
      var lines = text.trim().split("\n").filter(Boolean);
      lines.forEach(function(line) {
        try {
          var ev = JSON.parse(line);
          if (ev.event === "message" && ev.message) {
            var url = ev.message.trim();
            if (/^https?:\/\//.test(url)) saveAndOpen(url);
          }
        } catch(e) {}
      });
      return chrome.storage.local.set({ lastNtfyTime: Date.now() });
    });
  }).catch(function(e) {
    console.log("[pull] 失败:", e.message);
  });
}

// ── ntfy SSE 长连接 ────────────────────────────────
function connectNtfy() {
  chrome.storage.local.set({ ntfyConnected: false });
  return chrome.storage.local.get("lastNtfyTime").then(function(data) {
    var since = data.lastNtfyTime ? Math.floor(data.lastNtfyTime / 1000) : "all";
    console.log("[ntfy] 连接中，since:", since);
    return fetch("https://ntfy.sh/" + NTFY_TOPIC + "/sse?since=" + since, {
      headers: { Accept: "text/event-stream" }
    })
    .then(function(res) {
      if (!res.ok || !res.body) throw new Error("HTTP " + res.status);
      chrome.storage.local.set({ ntfyConnected: true, lastNtfyTime: Date.now() });
      console.log("[ntfy] 已连接，等待消息...");
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buf = "";
      function read() {
        return reader.read().then(function(chunk) {
          if (chunk.done) throw new Error("stream ended");
          buf += decoder.decode(chunk.value, { stream: true });
          var lines = buf.split("\n");
          buf = lines.pop();
          lines.forEach(function(line) {
            if (!line.startsWith("data:")) return;
            try {
              var ev = JSON.parse(line.slice(5).trim());
              if (ev.event === "message" && ev.message) {
                var url = ev.message.trim();
                if (/^https?:\/\//.test(url)) saveAndOpen(url);
              }
            } catch(e) {}
          });
          return read();
        });
      }
      return read();
    })
    .catch(function(e) {
      chrome.storage.local.set({ ntfyConnected: false, lastNtfyTime: Date.now() });
      console.log("[ntfy] 断线:", e.message, "10秒后重连");
      setTimeout(connectNtfy, 10000);
    });
  });
}

// ── 局域网轮询 ─────────────────────────────────────
function localPoll() {
  chrome.storage.local.get("enabled", function(d) {
    if (!d.enabled) return;
    fetch(LOCAL_POLL, { cache: "no-store" })
    .then(function(res) { return res.json(); })
    .then(function(data) { if (data.url) saveAndOpen(data.url); })
    .catch(function() {});
  });
}

// ── 消息处理 ───────────────────────────────────────
chrome.runtime.onMessage.addListener(function(msg, _, sendResponse) {
  if (msg.type === "pull_now") {
    pullNtfy().then(function() { sendResponse({ ok: true }); });
    return true;
  }
  if (msg.type === "reconnect_ntfy") {
    connectNtfy();
    sendResponse({ ok: true });
  }
  if (msg.type === "organize") {
    organizeBookmarks()
    .then(function(res) { sendResponse({ ok: true, total: res.total, updated: res.updated }); })
    .catch(function(e) { sendResponse({ ok: false, error: e.message }); });
    return true;
  }
  if (msg.type === "set_enabled") {
    chrome.storage.local.set({ enabled: msg.value });
    sendResponse({ ok: true });
  }
});
