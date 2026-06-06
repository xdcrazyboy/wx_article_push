# 微信文章推送器 / WechatPush — Save WeChat Articles

---

## 简介
在手机微信看到好文章，一键推送到电脑浏览器自动打开，并按公众号分类收藏到书签。支持家庭局域网和公司网络双模式，无需登录任何第三方账号。

Push WeChat articles from your phone to your PC browser with one tap. Articles auto-open and are saved to bookmarks, organized by official account name. Works on both home Wi-Fi and office networks. No third-party account required.

---

## 详细描述

### 解决什么问题 What problem does it solve
手机刷微信时看到好文章，想在电脑大屏上阅读却很麻烦——微信PC版限制多，复制链接再粘贴到浏览器步骤繁琐。

### 核心功能
- 📱 手机一键推送：复制文章链接后，点一个按钮即可推送到电脑
- 🖥️ 自动打开：电脑Chrome收到链接后自动在新标签页打开
- 🔖 智能收藏：自动提取文章标题和公众号名称，按公众号分类存入书签
- 🔄 双通道支持：家里用局域网直连，公司用ntfy.sh中转，两种网络自动切换
- 📥 补发机制：错过的消息重新连接后自动补拉，不丢失
- 🚫 去重保护：同一篇文章不会重复收藏


### 使用方式
1. 安装插件后，在电脑上运行配套的 server.py 本地服务
2. 手机浏览器访问本地服务页面，添加为书签
3. 看到好文章 → 微信复制链接 → 打开书签页 → 点击发送
4. 电脑自动打开文章并收藏 ✅

### 隐私说明
- 不收集任何用户数据
- 文章链接仅通过您自己配置的 ntfy 频道中转
- 所有书签数据存储在本地 Chrome 中


## 隐私政策  Privacy Policy for WechatPush Chrome Extension

Last updated: 2026-05-17

## Data Collection
WechatPush does not collect, transmit, or store any personal data on external servers.

## Data Usage
- Article URLs you push are relayed through ntfy.sh using a private topic name you configure. Ntfy.sh's own privacy policy applies to this relay.
- All bookmark data is stored exclusively in your local Chrome browser using chrome.storage and Chrome Bookmarks API.
- The extension does not track browsing history, personal information, or usage statistics.

## Third-party Services
- **ntfy.sh**: Used as a message relay for cross-network delivery. Only the article URL is sent. See ntfy.sh privacy policy at https://ntfy.sh/privacy.
- **mp.weixin.qq.com**: The extension reads page content from WeChat article tabs you open, solely to extract the article title and account name for bookmarking purposes.

## Contact
If you have any questions about this privacy policy, please open an issue on the project's GitHub repository.

---

## 分类和标签
- 类别：生产力工具（Productivity）
- 标签：WeChat, bookmarks, read later, article saver, cross-device

---
