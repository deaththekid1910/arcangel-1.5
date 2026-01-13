// index.js - Grupo Exequial Arcángel C.A. (versión Meta Cloud API - número de prueba)

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { google } = require('googleapis');
const { createCanvas, loadImage } = require('canvas');

// Meta Cloud API variables
const META_TOKEN = process.env.META_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use('/recibos', express.static(RECIBOS_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// Logo URL
const LOGO_URL = 'https://raw.githubusercontent.com/deaththekid1910/arcangel-1.5/main/WhatsApp_Image_2026-01-01_at_7.18.14_PM-removebg-preview.png';

// Anti-duplicados
const processedHashes = new Set();

// Verificación del webhook (GET) - OBLIGATORIO para Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('Verificación recibida:', { mode, token, challenge });

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verificado por Meta!');
      res.status(200).send(challenge);
    } else {
      console.log('Token inválido');
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// Recepción de mensajes (POST)
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') {
      return res.sendStatus(404);
    }

    const entry = body.entry[0];
    const change = entry.changes[0];
    const value = change.value;

    if (value.messages && value.messages[0]) {
      const message = value.messages[0];
      const from = message.from; // Número del cliente (ej: 58414...)
      const type = message.type;

      console.log(`Mensaje recibido de ${from} - Tipo: ${type}`);

      if (type === 'image') {
        const mediaId = message.image.id;
        const mediaUrl = await getMediaUrl(mediaId);
        await descargarImagen(mediaUrl, from);
      } else {
        // Mensaje de texto o saludo inicial
        await sendMessage(from, '¡Hola! Envía el capture de tu pago para generar tu recibo oficial.');
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error en webhook Meta:', error.message);
    res.sendStatus(500);
  }
});

// Obtener URL de media (para descargar imágenes)
async function getMediaUrl(mediaId) {
  const response = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${META_TOKEN}` }
  });
  return response.data.url;
}

// Descargar imagen y procesar
async function descargarImagen(mediaUrl, telefono) {
  try {
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${META_TOKEN}` }
    });
    const filePath = path.join(UPLOADS_DIR, `${telefono}.jpg`);
    fs.writeFileSync(filePath, response.data);
    console.log('Comprobante guardado:', filePath);

    const imageBuffer = response.data;
    const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

    if (processedHashes.has(hash)) {
      console.log('Duplicado detectado para:', telefono);
      await sendMessage(telefono, 'Ya recibimos y procesamos tu comprobante de pago anteriormente.\n\nSi necesitas asistencia adicional, escríbenos.\n\nGracias por confiar en Grupo Exequial Arcángel C.A.');
      return;
    }

    processedHashes.add(hash);
    await generarReciboYEnviar(telefono);
  } catch (error) {
    console.error('Error descargando imagen:', error.message);
  }
}

// Generar recibo (tu lógica original)
async function generarReciboYEnviar(telefono) {
  try {
    const fechaVenezuela = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Caracas' }));
    const horaRecepción = fechaVenezuela.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    const fechaRecepción = fechaVenezuela.toLocaleDateString('es-VE');
    const fechaCompleta = fechaVenezuela.toLocaleString('es-VE');

    const idOperacion = `ARC-${uuidv4().slice(0, 8).toUpperCase()}`;
    const reciboPath = path.join(RECIBOS_DIR, `${telefono}.png`);
    const comprobanteUrl = `${process.env.APP_URL}/uploads/${telefono}.jpg`;

    const width = 600;
    const height = 950;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f8f9fc';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    try {
      const logo = await loadImage(LOGO_URL);
      const logoSize = 180;
      ctx.drawImage(logo, width / 2 - logoSize / 2, 60, logoSize, logoSize);
    } catch (e) {
      console.log('Error cargando logo:', e.message);
    }

    ctx.fillStyle = '#16a34a';
    ctx.font = 'bold 100px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('✓', width / 2, 300);

    ctx.fillStyle = '#15803d';
    ctx.font = 'bold 32px Arial';
    ctx.fillText('PAGO RECIBIDO', width / 2, 360);

    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 36px Arial';
    ctx.fillText('Grupo Exequial Arcángel C.A.', width / 2, 440);

    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('RIF: J-40472273', width / 2, 480);

    ctx.fillStyle = '#1e40af';
    ctx.font = 'italic 24px Arial';
    ctx.fillText('Comprobante de Recepción', width / 2, 530);

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(80, 570);
    ctx.lineTo(width - 80, 570);
    ctx.stroke();

    ctx.fillStyle = '#1f2937';
    ctx.font = '22px Arial';
    ctx.textAlign = 'left';
    let y = 630;
    ctx.fillText(`Cliente: ${telefono}`, 80, y);
    y += 60;
    ctx.fillText(`Hora de recepción: ${horaRecepción}`, 80, y);
    y += 60;
    ctx.fillText(`Fecha: ${fechaRecepción}`, 80, y);
    y += 60;
    ctx.fillText(`ID de operación: ${idOperacion}`, 80, y);
    y += 60;

    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#15803d';
    ctx.textAlign = 'center';
    ctx.fillText('¡Tu pago ha sido recibido correctamente!', width / 2, y);
    y += 40;
    ctx.font = '18px Arial';
    ctx.fillStyle = '#374151';
    ctx.fillText('Estamos validando tu comprobante.', width / 2, y);

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(reciboPath, buffer);

    const mediaUrl = `${process.env.APP_URL}/recibos/${telefono}.png`;

    // Enviar recibo con Meta
    await sendMediaMessage(telefono, mediaUrl, 'Tu recibo oficial ha sido generado.');

    console.log('Recibo oficial enviado a:', telefono);

    // Registrar en Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A:D',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[idOperacion, telefono, fechaCompleta, comprobanteUrl]]
      }
    });
    console.log('Registrado en Sheets:', idOperacion);
  } catch (error) {
    console.error('Error generando/enviando recibo:', error.message);
  }
}

// Enviar mensaje de texto con Meta
async function sendMessage(to, text) {
  await axios.post(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: { body: text }
  }, {
    headers: {
      Authorization: `Bearer ${META_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}

// Enviar media (recibo PNG)
async function sendMediaMessage(to, mediaUrl, caption) {
  await axios.post(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'image',
    image: {
      link: mediaUrl,
      caption: caption
    }
  }, {
    headers: {
      Authorization: `Bearer ${META_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}

// Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Grupo Exequial Arcángel C.A. corriendo en puerto ${PORT} con Meta Cloud API`);
});
