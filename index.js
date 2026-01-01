// index.js - Arcangel 1.5 + Document AI (enero 2026)

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
const documentAI = require('@google-cloud/documentai').v1;

// =====================
// TWILIO
// =====================
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH;
const client = new Twilio(accountSid, authToken);

// =====================
// GOOGLE CREDENTIALS
// =====================
const creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

// Sheets
const authSheets = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth: authSheets });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Document AI
const documentClient = new documentAI.DocumentProcessorServiceClient({
  credentials: creds
});
const DOCUMENT_AI_PROCESSOR = process.env.DOCUMENT_AI_PROCESSOR;

// =====================
// DIRECTORIOS TEMP
// =====================
const UPLOADS_DIR = path.join('/tmp', 'uploads');
const RECIBOS_DIR = path.join('/tmp', 'recibos');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(RECIBOS_DIR)) fs.mkdirSync(RECIBOS_DIR, { recursive: true });

// =====================
// EXPRESS
// =====================
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/recibos', express.static(RECIBOS_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// =====================
// DOCUMENT AI - EXTRACCIÓN
// =====================
async function extraerDatosComprobante(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);

    const request = {
      name: DOCUMENT_AI_PROCESSOR,
      rawDocument: {
        content: fileBuffer,
        mimeType: 'image/jpeg'
      }
    };

    const [result] = await documentClient.processDocument(request);
    const document = result.document;

    const datos = {};
    if (document.entities) {
      document.entities.forEach(e => {
        datos[e.type?.toLowerCase()] = e.mentionText;
      });
    }

    console.log('📄 Datos extraídos por Document AI:', datos);
    return datos;

  } catch (error) {
    console.error('❌ Error Document AI:', error.message);
    return {};
  }
}

// =====================
// DESCARGAR IMAGEN
// =====================
async function descargarImagen(mediaUrl, telefono) {
  try {
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      auth: { username: accountSid, password: authToken }
    });

    const filePath = path.join(UPLOADS_DIR, `${telefono}.jpg`);
    fs.writeFileSync(filePath, response.data);

    console.log('📥 Comprobante guardado:', filePath);
    await generarReciboYEnviar(telefono, filePath);

  } catch (error) {
    console.error('❌ Error descargando imagen:', error.message);
  }
}

// =====================
// GENERAR RECIBO + ENVIAR
// =====================
async function generarReciboYEnviar(telefono, filePath) {
  try {
    const fecha = new Date();
    const idOperacion = `ARC-${uuidv4().slice(0, 8).toUpperCase()}`;
    const reciboPath = path.join(RECIBOS_DIR, `${telefono}.png`);
    const comprobanteUrl = `${process.env.APP_URL}/uploads/${telefono}.jpg`;

    // 🔍 Document AI (NO rompe si falla)
    const datosAI = await extraerDatosComprobante(filePath);

    // =====================
    // CANVAS
    // =====================
    const width = 600;
    const height = 900;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f8f9fc';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Arcángel Funeraria', width / 2, 100);

    ctx.font = 'italic 22px Arial';
    ctx.fillText('Comprobante de Recepción de Pago', width / 2, 140);

    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('● PAGO RECIBIDO ●', width / 2, 200);

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(80, 230);
    ctx.lineTo(width - 80, 230);
    ctx.stroke();

    ctx.fillStyle = '#1f2937';
    ctx.font = '20px Arial';
    ctx.textAlign = 'left';
    let y = 280;

    ctx.fillText(`Nº Referencia: ${idOperacion}`, 80, y);
    y += 50;
    ctx.fillText(`Cliente: ${telefono}`, 80, y);
    y += 50;
    ctx.fillText(`Fecha: ${fecha.toLocaleString('es-VE')}`, 80, y);

    if (datosAI.amount || datosAI.total) {
      y += 50;
      ctx.fillText(`Monto Detectado: ${datosAI.amount || datosAI.total}`, 80, y);
    }

    y += 80;
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#15803d';
    ctx.textAlign = 'center';
    ctx.fillText('¡Tu pago ha sido recibido correctamente!', width / 2, y);

    y += 40;
    ctx.font = '18px Arial';
    ctx.fillStyle = '#374151';
    ctx.fillText('Estamos validando tu comprobante.', width / 2, y);

    y += 80;
    ctx.fillStyle = '#6b7280';
    ctx.font = '16px Arial';
    ctx.fillText('Gracias por confiar en Arcángel Funeraria', width / 2, y);

    fs.writeFileSync(reciboPath, canvas.toBuffer('image/png'));

    // =====================
    // ENVIAR WHATSAPP
    // =====================
    const mediaUrl = `${process.env.APP_URL}/recibos/${telefono}.png`;
    await client.messages.create({
      from: 'whatsapp:+14155238886',
      to: `whatsapp:+${telefono}`,
      body: 'Gracias por tu pago. Te enviamos tu comprobante oficial.',
      mediaUrl: [mediaUrl]
    });

    // =====================
    // REGISTRAR EN SHEETS
    // =====================
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A:D',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[
          idOperacion,
          telefono,
          fecha.toLocaleString('es-VE'),
          comprobanteUrl
        ]]
      }
    });

    console.log('✅ Operación registrada:', idOperacion);

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// =====================
// WEBHOOK WHATSAPP
// =====================
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
        body: 'Envía el capture de tu pago para generar tu comprobante.'
      });
    }

    res.send('<Response></Response>');
  } catch (error) {
    console.error('❌ Error webhook:', error.message);
    res.status(500).send('Error');
  }
});

// =====================
// SERVER
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Arcángel 1.5 corriendo en puerto ${PORT}`);
});
