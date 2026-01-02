// index.js - Arcangel 1.5 Final (versión oficial Grupo Exequial Arcángel C.A.)

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Twilio = require('twilio');
const { google } = require('googleapis');
const { createCanvas, loadImage } = require('canvas');

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

// Logo URL (tu imagen subida a GitHub raw)
const LOGO_URL = 'https://raw.githubusercontent.com/deaththekid1910/arcangel-1.5/main/WhatsApp_Image_2026-01-01_at_7.18.14_PM-removebg-preview.png';

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

    await generarReciboYEnviar(telefono);
  } catch (error) {
    console.error('Error descargando imagen:', error.message);
  }
}

// Generar recibo oficial (actualizado)
async function generarReciboYEnviar(telefono) {
  try {
    // Fecha y hora actual en Venezuela (UTC-4)
    const fechaVenezuela = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Caracas' }));
    const horaRecepción = fechaVenezuela.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    const fechaRecepción = fechaVenezuela.toLocaleDateString('es-VE');
    const fechaCompleta = fechaVenezuela.toLocaleString('es-VE');

    const idOperacion = `ARC-${uuidv4().slice(0, 8).toUpperCase()}`;
    const reciboPath = path.join(RECIBOS_DIR, `${telefono}.png`);
    const comprobanteUrl = `${process.env.APP_URL}/uploads/${telefono}.jpg`;

    const width = 600;
    const height = 1100;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fondo
    ctx.fillStyle = '#f8f9fc';
    ctx.fillRect(0, 0, width, height);

    // Borde elegante
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // Logo
    try {
      const logo = await loadImage(LOGO_URL);
      const logoSize = 180;
      ctx.drawImage(logo, width / 2 - logoSize / 2, 60, logoSize, logoSize);
    } catch (e) {
      console.log('Error cargando logo:', e.message);
    }

    // Check grande
    ctx.fillStyle = '#16a34a';
    ctx.font = 'bold 100px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('✓', width / 2, 300);

    ctx.fillStyle = '#15803d';
    ctx.font = 'bold 32px Arial';
    ctx.fillText('PAGO RECIBIDO', width / 2, 360);

    // Título actualizado
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 36px Arial';
    ctx.fillText('Grupo Exequial Arcángel C.A.', width / 2, 440);

    ctx.fillStyle = '#1e40af';
    ctx.font = 'italic 24px Arial';
    ctx.fillText('Comprobante de Recepción', width / 2, 490);

    // Línea dorada
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(80, 530);
    ctx.lineTo(width - 80, 530);
    ctx.stroke();

    // Datos personalizados
    ctx.fillStyle = '#1f2937';
    ctx.font = '22px Arial';
    ctx.textAlign = 'left';
    let y = 590;
    ctx.fillText(`Cliente: ${telefono}`, 80, y);
    y += 60;
    ctx.fillText(`Hora de recepción: ${horaRecepción}`, 80, y);
    y += 60;
    ctx.fillText(`Fecha: ${fechaRecepción}`, 80, y);
    y += 60;
    ctx.fillText(`ID de operación: ${idOperacion}`, 80, y);
    y += 100;

    // Mensaje de confianza simplificado
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#15803d';
    ctx.textAlign = 'center';
    ctx.fillText('¡Tu pago ha sido recibido correctamente!', width / 2, y);
    y += 60;
    ctx.font = '20px Arial';
    ctx.fillStyle = '#374151';
    ctx.fillText('Estamos validando tu comprobante.', width / 2, y);
    y += 120;

    // Información oficial
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('RIF: J-40472273', width / 2, y);
    y += 50;
    ctx.font = '18px Arial';
    ctx.fillStyle = '#374151';
    ctx.fillText('Dirección: Av. Urdaneta C/C Calle Arvelo Nº 81-6', width / 2, y);
    y += 40;
    ctx.fillText('Frente a la Plaza Santa Rosa, Valencia', width / 2, y);
    y += 60;
    ctx.font = 'bold 20px Arial';
    ctx.fillText('Telf. 0241-8353240 / 0414-4715376', width / 2, y);

    // Guardar PNG
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(reciboPath, buffer);

    // Enviar por WhatsApp (mensaje simplificado)
    const mediaUrl = `${process.env.APP_URL}/recibos/${telefono}.png`;
    await client.messages.create({
      from: 'whatsapp:+14155238886',
      to: `whatsapp:+${telefono}`,
      body: `¡Hola!\n\nRecibimos tu comprobante a las ${horaRecepción} del ${fechaRecepción}.\n\nTu código de operación es:\n*${idOperacion}*\n\nEstamos validando tu comprobante.\n\nGracias por confiar en nosotros.`,
      mediaUrl: [mediaUrl]
    });
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
        body: 'Hola, por favor envía el capture de tu pago para generar tu comprobante oficial.'
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
  console.log(`Grupo Exequial Arcángel C.A. corriendo en puerto ${PORT}`);
});
