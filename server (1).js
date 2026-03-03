require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const QRCode = require("qrcode");
const https = require("https");
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 5000;
const TOURNAMENT_DATE = "Saturday, 7th March 2026";
const TOURNAMENT_TIME = "10:00 AM";
const TOURNAMENT_VENUE = "University Field";

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

const ticketSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  ticketType: { type: String, enum: ["Regular", "VIP"], default: "Regular" },
  amount: Number,
  status: { type: String, default: "Pending" },
  ticketCode: String,
  date: { type: String, default: TOURNAMENT_DATE },
  createdAt: { type: Date, default: Date.now }
});

const Ticket = mongoose.model("Ticket", ticketSchema);

function generateTicketCode(type) {
  const prefix = type === "VIP" ? "TKFL-VIP" : "TKFL-REG";
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${rand}`;
}

function sendBrevoEmail(toEmail, toName, subject, htmlContent) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      sender: { name: "Tourist Kosgei Football League", email: process.env.EMAIL_USER },
      to: [{ email: toEmail, name: toName }],
      subject: subject,
      htmlContent: htmlContent
    });
    const options = {
      hostname: "api.brevo.com",
      path: "/v3/smtp/email",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "Content-Length": Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`Brevo API error: ${res.statusCode} - ${body}`));
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

app.post("/buy-ticket", async (req, res) => {
  try {
    const { name, email, phone, ticketType } = req.body;
    if (!name || !email || !phone || !ticketType) {
      return res.status(400).json({ message: "All fields are required." });
    }
    const amount = ticketType === "VIP" ? 500 : 200;
    const ticketCode = generateTicketCode(ticketType);
    const ticket = new Ticket({ name, email, phone, ticketType, amount, ticketCode });
    await ticket.save();
    res.json({ message: "Ticket request submitted successfully." });
  } catch (err) {
    console.error("Buy ticket error:", err);
    res.status(500).json({ message: "Server error. Please try again." });
  }
});

app.get("/tickets", async (req, res) => {
  const tickets = await Ticket.find().sort({ createdAt: -1 });
  res.json(tickets);
});

app.post("/approve/:id", async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      { status: "Approved" },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const qrDataURL = await QRCode.toDataURL(ticket.ticketCode, {
      width: 250,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" }
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
          .wrapper { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #0047AB, #006400); padding: 40px 30px; text-align: center; color: white; }
          .header h1 { font-size: 28px; margin: 0 0 8px; }
          .header p { margin: 0; opacity: 0.85; font-size: 14px; }
          .ticket-body { padding: 35px 30px; }
          .approved-badge { background: #e8f5e9; border: 2px solid #4caf50; color: #2e7d32; font-weight: 700; font-size: 14px; padding: 10px 20px; border-radius: 50px; display: inline-block; margin-bottom: 25px; }
          .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
          .detail-label { color: #888; font-size: 13px; }
          .detail-value { font-weight: 700; font-size: 14px; color: #222; }
          .ticket-code-display { background: #0047AB; color: #FFD700; font-size: 20px; font-weight: 900; letter-spacing: 3px; padding: 15px 25px; border-radius: 10px; text-align: center; margin: 20px 0; font-family: monospace; }
          .qr-section { text-align: center; padding: 30px; background: #f9f9f9; border-radius: 12px; margin: 25px 0; }
          .qr-section img { width: 200px; height: 200px; border: 4px solid #0047AB; border-radius: 8px; }
          .qr-section p { margin: 12px 0 0; font-size: 12px; color: #888; }
          .warning { background: #fff3cd; border: 1px solid #ffc107; color: #856404; padding: 14px 18px; border-radius: 8px; font-size: 13px; margin-top: 20px; }
          .footer { background: #0a1628; color: rgba(255,255,255,0.5); text-align: center; padding: 20px; font-size: 12px; }
          .footer strong { color: #FFD700; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="header">
            <h1>🏆 Tourist Kosgei Football League</h1>
            <p>Official Tournament 2026 · Your Ticket is Confirmed</p>
          </div>
          <div class="ticket-body">
            <div class="approved-badge">✅ TICKET APPROVED & CONFIRMED</div>
            <div class="detail-row"><span class="detail-label">Buyer Name</span><span class="detail-value">${ticket.name}</span></div>
            <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${ticket.email}</span></div>
            <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${ticket.phone}</span></div>
            <div class="detail-row"><span class="detail-label">Ticket Type</span><span class="detail-value">${ticket.ticketType.toUpperCase()}</span></div>
            <div class="detail-row"><span class="detail-label">Amount Paid</span><span class="detail-value">KES ${ticket.amount.toLocaleString()}</span></div>
            <div class="detail-row"><span class="detail-label">Event Date</span><span class="detail-value">${TOURNAMENT_DATE}</span></div>
            <div class="detail-row"><span class="detail-label">Time</span><span class="detail-value">From ${TOURNAMENT_TIME}</span></div>
            <div class="detail-row"><span class="detail-label">Venue</span><span class="detail-value">${TOURNAMENT_VENUE}</span></div>
            <div class="ticket-code-display">${ticket.ticketCode}</div>
            <div class="qr-section">
              <img src="${qrDataURL}" alt="QR Code" />
              <p>Present this QR code at the gate for entry</p>
            </div>
            <div class="warning">
              ⚠️ <strong>Valid for one entry only.</strong> This ticket is non-transferable and can only be used once.
            </div>
          </div>
          <div class="footer">
            <strong>Tourist Kosgei Football League</strong> · University Field · 7th March 2026
          </div>
        </div>
      </body>
      </html>
    `;

    await sendBrevoEmail(
      ticket.email,
      ticket.name,
      `🎟 Your TKFL Tournament Ticket — ${ticket.ticketCode}`,
      htmlContent
    );

    console.log("Email sent successfully to:", ticket.email);
    res.json({ message: "Ticket approved and email sent." });
  } catch (err) {
    console.error("Approve error:", err);
    res.status(500).json({ message: "Error approving ticket." });
  }
});

app.post("/mark-sold/:id", async (req, res) => {
  try {
    await Ticket.findByIdAndUpdate(req.params.id, { status: "Sold" });
    res.json({ message: "Ticket marked as sold." });
  } catch (err) {
    res.status(500).json({ message: "Error updating ticket." });
  }
});

app.post("/reset-pending/:id", async (req, res) => {
  try {
    await Ticket.findByIdAndUpdate(req.params.id, { status: "Pending" });
    res.json({ message: "Ticket reset to pending." });
  } catch (err) {
    res.status(500).json({ message: "Error resetting ticket." });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
