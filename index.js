// index.js - Arcangel 1.5 (versión con canvas para recibo PNG - funciona en Render Free)

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Twilio = require('twilio');
const vision = require('@google-cloud/vision');
const { google } = require('googleapis');
const { createCanvas } = require('canvas');

// Configuración Twilio
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH;
const client = new Twilio(accountSid, authToken);

// Configuración Google
const creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
const visionClient = new vision.ImageAnnotatorClient({ credentials: creds });

const authSheets = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth: authSheets });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Carpetas temporales (Render usa /tmp)
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

// Descargar imagen del comprobante
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
    console.error('Error descargando:', error.message);
  }
}

// OCR con Google Vision
async function extraerTextoOCR(filePath) {
  try {
    const [result] = await visionClient.textDetection(filePath);
    return result.fullTextAnnotation ? result.fullTextAnnotation.text : '';
  } catch (error) {
    console.error('Error OCR:', error.message);
    return '';
  }
}

// Generar recibo con canvas (PNG) y enviar
async function generarReciboYEnviar(telefono, filePath, textoOCR) {
  try {
    const fecha = new Date();
    const idOperacion = `ARC-${uuidv4().slice(0, 8).toUpperCase()}`;
    const reciboPath = path.join(RECIBOS_DIR, `${telefono}.png`);
    const comprobanteUrl = `${process.env.APP_URL}/uploads/${telefono}.jpg`;

    // Crear canvas
    const width = 600;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fondo blanco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Logo o título
    ctx.fillStyle = '#1f3a5f';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('Arcángel Funeraria', 100, 100);

    // Subtítulo
    ctx.fillStyle = '#666666';
    ctx.font = '20px Arial';
    ctx.fillText('Recibo de Confirmación de Pago', 100, 140);

    // Línea divisoria
    ctx.strokeStyle = '#1f3a5f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(100, 160);
    ctx.lineTo(500, 160);
    ctx.stroke();

    // Datos
    ctx.fillStyle = '#333333';
    ctx.font = '18px Arial';
    ctx.fillText(`Cliente: ${telefono}`, 100, 200);
    ctx.fillText(`ID Operación: ${idOperacion}`, 100, 240);
    ctx.fillText(`Fecha: ${fecha.toLocaleString('es-VE')}`, 100, 280);
    ctx.fillText('Estado: Recibido - En validación', 100, 320);

    // Footer
    ctx.font = '14px Arial';
    ctx.fillStyle = '#777777';
    ctx.fillText('Este es un recibo automático de recepción.', 100, 500);
    ctx.fillText('Gracias por confiar en Arcángel Funeraria.', 100, 520);

    // Guardar PNG
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(reciboPath, buffer);

    // Enviar por WhatsApp
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
  }
}

// Webhook de Twilio
app.post('/whatsapp', async (req, res) => {
  try {
    const from = req.body.From?.replace('whatsapp:+', '');
    const numMedia = parseInt(req.body.NumMedia || '0');

    if (numMedia > 0 && req.body.MediaUrl0) {
      await descargarImagen(req.body.MediaUrl0, from);
    }

    res.send('<Response></Response>');
  } catch (error) {
    console.error('Error en webhook:', error.message);
    res.status(500).send('Error');
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Arcangel 1.5 corriendo en puerto ${PORT}`);
});
