const nodemailer = require('nodemailer');

async function sendResetEmail(to, url) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASS,
    },
  });
  await transporter.sendMail({
    from: '"Your App" <no-reply@yourapp.com>',
    to,
    subject: 'Đặt lại mật khẩu',
    html: `<p>Bạn vừa yêu cầu đặt lại mật khẩu.</p>
           <p>Nhấn vào <a href="${url}">liên kết này</a> (hết hạn sau 15 phút).</p>`,
  });
}

module.exports = { sendResetEmail };

