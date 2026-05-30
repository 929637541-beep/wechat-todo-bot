const crypto = require('crypto');

const WX_TOKEN = 'todobot2024';
const DS_KEY = 'sk-6a780713b73d42368c6e7bed639df4a9';

function sha1(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

function verifySignature(token, timestamp, nonce, signature) {
  const arr = [token, timestamp, nonce].sort();
  return sha1(arr.join('')) === signature;
}

function parseXML(xml) {
  const content = (xml.match(/<Content><!\[CDATA\[([\s\S]*?)\]\]><\/Content>/) || [])[1] || '';
  const fromUser = (xml.match(/<FromUserName><!\[CDATA\[([\s\S]*?)\]\]><\/FromUserName>/) || [])[1] || '';
  const toUser = (xml.match(/<ToUserName><!\[CDATA\[([\s\S]*?)\]\]><\/ToUserName>/) || [])[1] || '';
  const msgType = (xml.match(/<MsgType><!\[CDATA\[([\s\S]*?)\]\]><\/MsgType>/) || [])[1] || '';
  return { content, fromUser, toUser, msgType };
}

function buildReply(toUser, fromUser, content) {
  const time = Math.floor(Date.now() / 1000);
  return `<xml>
<ToUserName><![CDATA[${toUser}]]></ToUserName>
<FromUserName><![CDATA[${fromUser}]]></FromUserName>
<CreateTime>${time}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${content}]]></Content>
</xml>`;
}

async function callDeepSeek(text) {
  const prompt = `你是一个待办事项提取助手。用户会发给你一段文字或聊天记录，请帮他提取出所有需要行动的待办事项。

要求：
1. 每条待办前加上 ⚡ 符号
2. 如果有截止时间，在后面标注
3. 如果是想法/灵感，前面加 💡
4. 如果是参考资料，前面加 📎
5. 格式简洁，一行一条
6. 最后加一行：「共 X 条，已整理完毕 ✅」

用户输入：
${text}`;

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DS_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  return data.choices[0].message.content;
}

module.exports = async (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query;

  if (!verifySignature(WX_TOKEN, timestamp, nonce, signature)) {
    return res.status(403).send('Invalid signature');
  }

  // 微信验证
  if (req.method === 'GET') {
    return res.send(echostr);
  }

  // 接收消息
  if (req.method === 'POST') {
    let body = '';
    await new Promise((resolve) => {
      req.on('data', chunk => body += chunk);
      req.on('end', resolve);
    });

    const { content, fromUser, toUser, msgType } = parseXML(body);

    if (msgType !== 'text' || !content.trim()) {
      return res.send(buildReply(fromUser, toUser, '请发送文字内容，我来帮你提取待办事项 📝'));
    }

    try {
      const result = await callDeepSeek(content);
      return res.send(buildReply(fromUser, toUser, result));
    } catch (e) {
      return res.send(buildReply(fromUser, toUser, '解析失败，请稍后重试'));
    }
  }
};
