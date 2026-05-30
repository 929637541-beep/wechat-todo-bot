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
  const get = (tag) => {
    const m = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
    return m ? m[1] : '';
  };
  return {
    content: get('Content'),
    fromUser: get('FromUserName'),
    toUser: get('ToUserName'),
    msgType: get('MsgType'),
  };
}

function buildReply(toUser, fromUser, content) {
  return `<xml><ToUserName><![CDATA[${toUser}]]></ToUserName><FromUserName><![CDATA[${fromUser}]]></FromUserName><CreateTime>${Math.floor(Date.now()/1000)}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${content}]]></Content></xml>`;
}

async function callDeepSeek(text) {
  const prompt = `你是待办事项提取助手。从用户发的文字中提取所有需要行动的事项。
每条待办前加⚡，想法前加💡，参考资料前加📎。
格式简洁，一行一条。最后加「共X条 ✅」。

用户内容：${text}`;

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DS_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
  });
  const data = await res.json();
  return data.choices[0].message.content;
}

export default async function handler(req, res) {
  const { signature, timestamp, nonce, echostr } = req.query;

  if (!verifySignature(WX_TOKEN, timestamp, nonce, signature)) {
    return res.status(403).send('forbidden');
  }

  if (req.method === 'GET') {
    return res.status(200).send(echostr);
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const { content, fromUser, toUser, msgType } = parseXML(body);

    if (msgType !== 'text' || !content.trim()) {
      return res.status(200).send(buildReply(fromUser, toUser, '请发文字，我帮你提取待办 📝'));
    }

    try {
      const result = await callDeepSeek(content);
      return res.status(200).send(buildReply(fromUser, toUser, result));
    } catch (e) {
      return res.status(200).send(buildReply(fromUser, toUser, '解析失败，请稍后重试'));
    }
  }

  return res.status(200).send('ok');
}
