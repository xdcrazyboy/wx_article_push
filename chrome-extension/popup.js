var dot = document.getElementById('dot');
var connStatus = document.getElementById('conn-status');
var localStatus = document.getElementById('local-status');

chrome.storage.local.get(['enabled', 'ntfyConnected'], function(d) {
  var enabled = d.enabled !== false;
  document.getElementById('toggle-enabled').checked = enabled;
  dot.className = 'status-dot ' + (enabled ? 'on' : 'off');
  updateNtfyStatus(d.ntfyConnected);
});

function updateNtfyStatus(connected) {
  connStatus.textContent = connected ? '✓ 已连接' : '✗ 未连接';
  connStatus.className = connected ? 'ok' : 'err';
}

async function checkLocal() {
  localStatus.textContent = '检测中...';
  localStatus.className = '';
  try {
    var res = await fetch('http://localhost:8765/poll', { cache: 'no-store' });
    localStatus.textContent = res.ok ? '✓ 在线' : '✗ 未启动';
    localStatus.className = res.ok ? 'ok' : 'err';
  } catch {
    localStatus.textContent = '✗ 未启动';
    localStatus.className = 'err';
  }
}

checkLocal();

document.getElementById('toggle-enabled').addEventListener('change', function(e) {
  var val = e.target.checked;
  dot.className = 'status-dot ' + (val ? 'on' : 'off');
  chrome.runtime.sendMessage({ type: 'set_enabled', value: val });
});

document.getElementById('btn-pull').addEventListener('click', function() {
  var btn = this;
  btn.textContent = '拉取中...';
  btn.disabled = true;
  chrome.runtime.sendMessage({ type: 'pull_now' }, function() {
    setTimeout(function() {
      btn.textContent = '📥 立即拉取消息';
      btn.disabled = false;
    }, 1500);
  });
});

document.getElementById('btn-reconnect').addEventListener('click', function() {
  var btn = this;
  btn.textContent = '重连中...';
  btn.disabled = true;
  connStatus.textContent = '连接中...';
  connStatus.className = '';
  chrome.runtime.sendMessage({ type: 'reconnect_ntfy' }, function() {
    setTimeout(function() {
      chrome.storage.local.get('ntfyConnected', function(d) {
        updateNtfyStatus(d.ntfyConnected);
        btn.textContent = '🔁 重连 ntfy';
        btn.disabled = false;
      });
    }, 2000);
  });
});

// 整理收藏夹
document.getElementById('btn-organize').addEventListener('click', function() {
  var btn = this;
  var statusEl = document.getElementById('organize-status');
  btn.textContent = '整理中...';
  btn.disabled = true;
  statusEl.style.display = 'block';
  statusEl.className = 'organize-running';
  statusEl.textContent = '正在读取收藏夹...';

  chrome.runtime.sendMessage({ type: 'organize' }, function(res) {
    if (res && res.ok) {
      statusEl.className = 'organize-ok';
      statusEl.textContent = '✓ 整理完成：共 ' + res.total + ' 条，更新 ' + res.updated + ' 条';
    } else {
      statusEl.className = 'organize-err';
      statusEl.textContent = '✗ 整理失败：' + (res && res.error || '未知错误');
    }
    btn.textContent = '🗂️ 整理收藏夹';
    btn.disabled = false;
  });
});
