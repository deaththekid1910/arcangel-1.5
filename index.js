// index.js - Arcangel 1.5 (recibo elegante y profesional con canvas)

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser';
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Twilio = require('twilio');
const vision = require('@google-cloud/vision');
const { google } = require('googleapis');
const { createCanvas, loadImage } = require('canvas');

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

    await generarReciboYEnviar(telefono);
  } catch (error) {
    console.error('Error descargando:', error.message);
  }
}

// Generar recibo elegante con canvas
async function generarReciboYEnviar(telefono) {
  try {
    const fecha = new Date();
    const idOperacion = `ARC-${uuidv4().slice(0, 8).toUpperCase()}`;
    const reciboPath = path.join(RECIBOS_DIR, `${telefono}.png`);
    const comprobanteUrl = `${process.env.APP_URL}/uploads/${telefono}.jpg`;

    // Tamaño del recibo (formato vertical elegante)
    const width = 600;
    const height = 900;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fondo suave
    ctx.fillStyle = '#f8f9fc';
    ctx.fillRect(0, 0, width, height);

    // Borde elegante
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // Título principal
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Arcángel Funeraria', width / 2, 100);

    ctx.fillStyle = '#1e40af';
    ctx.font = 'italic 22px Arial';
    ctx.fillText('Comprobante de Recepción de Pago', width / 2, 140);

    // Sello de confianza
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('● PAGO RECIBIDO ●', width / 2, 200);

    // Línea divisoria dorada
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(80, 230);
    ctx.lineTo(width - 80, 230);
    ctx.stroke();

    // Datos del pago
    ctx.fillStyle = '#1f2937';
    ctx.font = '20px Arial';
    ctx.textAlign = 'left';
    const lineHeight = 50;
    let y = 280;

    ctx.fillText(`Nº de Referencia: ${idOperacion}`, 80, y);
    y += lineHeight;
    ctx.fillText(`Teléfono Cliente: ${telefono}`, 80, y);
    y += lineHeight;
    ctx.fillText(`Fecha y Hora: ${fecha.toLocaleString('es-VE')}`, 80, y);
    y += lineHeight * 1.5;

    // Mensaje de confianza
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#15803d';
    ctx.textAlign = 'center';
    ctx.fillText('¡Tu pago ha sido recibido correctamente!', width / 2, y);
    y += lineHeight;
    ctx.font = '18px Arial';
    ctx.fillStyle = '#374151';
    ctx.fillText('Estamos validando tu comprobante.', width / 2, y);
    y += lineHeight;
    ctx.fillText('En breve te confirmaremos el procesamiento.', width / 2, y);
    y += lineHeight * 1.5;

    // Footer profesional
    ctx.fillStyle = '#6b7280';
    ctx.font = '16px Arial';
    ctx.fillText('Gracias por confiar en Arcángel Funeraria', width / 2, y);
    y += 40;
    ctx.font = '14px Arial';
    ctx.fillText('Este es un comprobante automático de recepción.', width / 2, y);
    y += 30;
    ctx.fillText('Para cualquier consulta: +58 XXX-XXX-XXXX', width / 2, y);

    // Guardar imagen
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(reciboPath, buffer);

    // Enviar por WhatsApp
    const mediaUrl = `${process.env.APP_URL}/recibos/${telefono}.png`;
    await client.messages.create({
      from: 'whatsapp:+14155238886',
      to: `whatsapp:+${telefono}`,
      body: '¡Gracias por tu pago!\n\nTe adjuntamos tu comprobante oficial de recepción.\nEstamos validando tu transferencia y en minutos te confirmaremos.',
      mediaUrl: [mediaUrl]
    });
    console.log('Recibo elegante enviado a:', telefono);

    // Registrar en Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A:D',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[idOperacion, telefono, fecha.toLocaleString('es-VE'), comprobanteUrl]] }
    });
    console.log('Registrado en Sheets:', idOperacion);

  } catch (error) {
    console.error('Error generando/enviando recibo elegante:', error.message);
  }
}

// Webhook
app.post('/whatsapp', async (req, res) => {
  try {
    const from = req.body.From?.replace('whatsapp:+', '');
    const numMedia = parseInt(req.body.NumMedia || '0');

    if (numMedia > 0 && req.body.MediaUrl0) {
      await descargarImagen(req.body.MediaUrl0, from);
    } else {
      await client.messages.create({
        from: 'whatsapp:+14155238886',
        to: `whatsapp:+${from}`,
        body: 'Hola, por favor envía el capture de tu pago para generar tu comprobante automático.'
      });
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
  console.log(`Arcangel 1.5 (recibo elegante) corriendo en puerto ${PORT}`);
});
