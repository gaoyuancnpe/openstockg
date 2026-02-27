import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables FIRST
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Loading environment variables...');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  console.log('Testing email configuration...');
  const email = process.env.NODEMAILER_EMAIL;
  
  if (!email) {
    console.error('❌ NODEMAILER_EMAIL is not set in environment variables.');
    process.exit(1);
  }

  console.log(`Using email: ${email}`);

  // Dynamically import transporter AFTER env vars are loaded
  const { transporter } = await import('../lib/nodemailer/index');

  const mailOptions = {
    from: `"OpenStock Test" <${email}>`,
    to: email, // Send to self
    subject: 'OpenStock Email Test',
    text: 'This is a test email to verify Nodemailer configuration.',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h1>OpenStock Email Test</h1>
        <p>This email confirms that your Nodemailer configuration is working correctly.</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      </div>
    `,
  };

  try {
    console.log('Sending test email...');
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
  } finally {
    transporter.close();
  }
}

main().catch(console.error);
