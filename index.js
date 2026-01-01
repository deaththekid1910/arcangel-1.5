// index.js - Arcangel 1.5 (versión final corregida - enero 2026)

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Twilio = require('twilio');
const { google } = require('googleapis');
const { createCanvas } = require('canvas');

// Twilio
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH;
const client = new Twilio(accountSid, authToken);

// Google Sheets
const creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
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

    await generarReciboYEnviar(telefono, filePath);
  } catch (error) {
    console.error('Error descargando imagen:', error.message);
  }
}

// Generar recibo elegante y registrar
async function generarReciboYEnviar(telefono, filePath) {
  try {
    const fecha = new Date();
    const idOperacion = `ARC-${uuidv4().slice(0, 8).toUpperCase()}`;
    const reciboPath = path.join(RECIBOS_DIR, `${telefono}.png`);
    const comprobanteUrl = `${process.env.APP_URL}/uploads/${telefono}.jpg`;

    // Canvas para recibo elegante
    const width = 600;
    const height = 900;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fondo
    ctx.fillStyle = '#f8f9fc';
    ctx.fillRect(0, 0, width, height);

    // Borde
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // Título
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Arcángel Funeraria', width / 2, 100);

    ctx.fillStyle = '#1e40af';
    ctx.font = 'italic 22px Arial';
    ctx.fillText('Comprobante de Recepción de Pago', width / 2, 140);

    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('● PAGO RECIBIDO ●', width / 2, 200);

    // Línea
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(80, 230);
    ctx.lineTo(width - 80, 230);
    ctx.stroke();

    // Datos
    ctx.fillStyle = '#1f2937';
    ctx.font = '20px Arial';
    ctx.textAlign = 'left';
    let y = 280;
    ctx.fillText(`Nº Referencia: ${idOperacion}`, 80, y);
    y += 60;
    ctx.fillText(`Cliente: ${telefono}`, 80, y);
    y += 60;
    ctx.fillText(`Fecha: ${fecha.toLocaleString('es-VE')}`, 80, y);
    y += 100;

    // Mensaje confianza
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#15803d';
    ctx.textAlign = 'center';
    ctx.fillText('¡Tu pago ha sido recibido correctamente!', width / 2, y);
    y += 50;
    ctx.font = '18px Arial';
    ctx.fillStyle = '#374151';
    ctx.fillText('Estamos validando tu comprobante.', width / 2, y);
    y += 50;
    ctx.fillText('En breve te confirmaremos.', width / 2, y);
    y += 100;

    // Footer
    ctx.fillStyle = '#6b7280';
    ctx.font = '16px Arial';
    ctx.fillText('Gracias por confiar en Arcángel Funeraria', width / 2, y);

    // Guardar PNG
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(reciboPath, buffer);

    // Enviar recibo
    const mediaUrl = `${process.env.APP_URL}/recibos/${telefono}.png`;
    await client.messages.create({
      from: 'whatsapp:+14155238886',
      to: `whatsapp:+${telefono}`,
      body: '¡Gracias por tu pago!\n\nTe adjuntamos tu comprobante oficial.\nEstamos validando tu transferencia.',
      mediaUrl: [mediaUrl]
    });
    console.log('Recibo enviado a:', telefono);

    // Registrar en Sheets (tu hoja exacta)
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A:D',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[idOperacion, telefono, fecha.toLocaleString('es-VE'), comprobanteUrl]]
      }
    });
    console.log('Registrado en Sheets:', idOperacion);

  } catch (error) {
    console.error('Error generando/enviando:', error.message);
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
        body: 'Hola, envía el capture de tu pago para generar tu comprobante.'
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
  console.log(`Arcangel 1.5 corriendo en puerto ${PORT}`);
});
