var detectedUrl = '';

function isUrl(s) {
  return /^https?:\/\//.test(s);
}

// 点击主按钮：读取剪贴板并发送
document.getElementById('btn-paste-send').addEventListener('click', async function () {
  var text = null;
  if (navigator.clipboard && navigator.clipboard.readText) {
    try {
      text = await navigator.clipboard.readText();
    } catch (e) {
      text = null;
    }
  }

  if (text && isUrl(text.trim())) {
    detectedUrl = text.trim();
    showAutoCard('🔗', '检测到链接，正在发送...', detectedUrl);
    sendUrl(detectedUrl);
  } else {
    // 没读到链接，降级为手动输入
    document.getElementById('init-area').style.display = 'none';
    document.getElementById('manual-area').style.display = 'block';
    if (text && text.trim()) {
      showToast('剪贴板内容不是链接，请手动粘贴', false);
    } else {
      showToast('未获取到内容，请手动粘贴链接', false);
    }
  }
});

// 手动发送按钮
document.getElementById('btn-send').addEventListener('click', function () {
  var url = document.getElementById('url-input').value.trim();
  if (!url) { showToast('请先粘贴链接', false); return; }
  sendUrl(url);
  document.getElementById('url-input').value = '';
});

document.getElementById('url-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('btn-send').click();
  }
});

function showAutoCard(icon, msg, url) {
  document.getElementById('init-area').style.display = 'none';
  var card = document.getElementById('auto-card');
  card.style.display = 'block';
  card.className = 'auto-card';
  document.getElementById('auto-icon').textContent = icon;
  document.getElementById('auto-msg').textContent = msg;
  document.getElementById('url-preview').textContent = url || '';
}

function sendUrl(url) {
  fetch('/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (d.ok) {
      var card = document.getElementById('auto-card');
      card.className = 'auto-card success';
      document.getElementById('auto-icon').textContent = '✅';
      document.getElementById('auto-msg').textContent = '已发送！电脑正在打开...';
      showToast('✓ 发送成功', true);
    } else {
      showToast('发送失败，请重试', false);
    }
  })
  .catch(function () {
    showToast('网络错误，请检查WiFi', false);
    // 降级为手动
    document.getElementById('auto-card').style.display = 'none';
    document.getElementById('init-area').style.display = 'none';
    document.getElementById('manual-area').style.display = 'block';
    document.getElementById('url-input').value = detectedUrl;
  });
}

function showToast(msg, ok) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + (ok ? 'ok' : 'err');
  setTimeout(function () { t.className = 'toast'; }, 3000);
}
