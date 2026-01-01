// index.js - Arcangel 1.5 (versión definitiva para Render - enero 2026)

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const Twilio = require('twilio');
const vision = require('@google-cloud/vision');
const { google } = require('googleapis');

// Twilio
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH;
const client = new Twilio(accountSid, authToken);

// Google
const creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
const visionClient = new vision.ImageAnnotatorClient({ credentials: creds });

const authSheets = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth: authSheets });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Carpetas temporales
const UPLOADS_DIR = path.join('/tmp', 'uploads');
const RECIBOS_DIR = path.join('/tmp', 'recibos');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(RECIBOS_DIR)) fs.mkdirSync(RECIBOS_DIR, { recursive: true });

// Express
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/recibos', express.static(RECIBOS_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// Descargar imagen
async function descargarImagen(mediaUrl, telefono) {
  try {
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      auth: { username: accountSid, password: authToken }
    });
    const filePath = path.join(UPLOADS_DIR, `${telefono}.jpg`);
    fs.writeFileSync(filePath, response.data);
    console.log('Comprobante guardado:', filePath);

    const textoOCR = await extraerTextoOCR(filePath);
    await generarReciboYEnviar(telefono, filePath, textoOCR);
  } catch (error) {
    console.error('Error descargando imagen:', error.message);
  }
}

// OCR
async function extraerTextoOCR(filePath) {
  try {
    const [result] = await visionClient.textDetection(filePath);
    return result.fullTextAnnotation ? result.fullTextAnnotation.text : '';
  } catch (error) {
    console.error('Error en OCR:', error.message);
    return '';
  }
}

// Generar recibo y enviar
async function generarReciboYEnviar(telefono, filePath, textoOCR) {
  let browser = null;
  try {
    const fecha = new Date();
    const idOperacion = `ARC-${uuidv4().slice(0, 8).toUpperCase()}`;
    const reciboPath = path.join(RECIBOS_DIR, `${telefono}.png`);
    const comprobanteUrl = `${process.env.APP_URL}/uploads/${telefono}.jpg`;

    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <style>
        body { background: #f9f9f9; font-family: Arial, sans-serif; padding: 40px; }
        .recibo { background: white; max-width: 600px; margin: auto; padding: 30px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        h1 { color: #1f3a5f; margin: 0; font-size: 28px; }
        .divider { border-top: 3px solid #1f3a5f; margin: 20px 0; }
        .row { display: flex; justify-content: space-between; margin: 15px 0; font-size: 16px; }
        .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #777; }
      </style>
    </head>
    <body>
      <div class="recibo">
        <div class="header">
          <h1>Arcángel Funeraria</h1>
          <p>Recibo de Confirmación de Pago</p>
        </div>
        <div class="divider"></div>
        <div class="row"><span>Cliente:</span><strong>${telefono}</strong></div>
        <div class="row"><span>ID Operación:</span><strong>${idOperacion}</strong></div>
        <div class="row"><span>Fecha:</span><strong>${fecha.toLocaleString('es-VE')}</strong></div>
        <div class="row"><span>Estado:</span><strong>Recibido - En validación</strong></div>
        <div class="footer">
          Este es un recibo automático de recepción.<br>
          Gracias por confiar en Arcángel Funeraria.
        </div>
      </div>
    </body>
    </html>
    `;

    // Lanzamiento con chrome-headless-shell (ligero y compatible con Render)
    browser = await puppeteer.launch({
      headless: 'shell',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process'
      ]
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: reciboPath, fullPage: true });
    await browser.close();
    browser = null;

    // Enviar recibo
    const mediaUrl = `${process.env.APP_URL}/recibos/${telefono}.png`;
    await client.messages.create({
      from: 'whatsapp:+14155238886',
      to: `whatsapp:+${telefono}`,
      body: 'Gracias por tu pago. Adjuntamos tu recibo de confirmación.',
      mediaUrl: [mediaUrl]
    });
    console.log('Recibo enviado a:', telefono);

    // Registrar en Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A:D',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[idOperacion, telefono, fecha.toLocaleString('es-VE'), comprobanteUrl]] }
    });
    console.log('Registrado en Sheets:', idOperacion);

  } catch (error) {
    console.error('Error generando/enviando recibo:', error.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// Webhook
app.post('/whatsapp', async (req, res) => {
  try {
    const from = req.body.From?.replace('whatsapp:+', '');
    const numMedia = parseInt(req.body.NumMedia || '0');

    if (numMedia > 0 && req.body.MediaUrl0) {
      await descargarImagen(req.body.MediaUrl0, from);
    }

    res.send('<Response></Response>');
  } catch (error) {
    console.error('Error webhook:', error.message);
    res.status(500).send('Error');
  }
});

// Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Arcangel 1.5 corriendo en puerto ${PORT}`);
});
