// index.js - Arcangel 1.5 (versión simple - solo respuesta de texto)

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Twilio = require('twilio');

// Twilio
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH;
const client = new Twilio(accountSid, authToken);

// Carpetas temporales
const UPLOADS_DIR = path.join('/tmp', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Express
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// Webhook de Twilio
app.post('/whatsapp', async (req, res) => {
  try {
    const from = req.body.From?.replace('whatsapp:+', '');
    const numMedia = parseInt(req.body.NumMedia || '0');

    console.log(`Mensaje recibido de: ${from}`);

    if (numMedia > 0 && req.body.MediaUrl0) {
      // Descargar la imagen (solo para confirmar que llega)
      const response = await axios.get(req.body.MediaUrl0, {
        responseType: 'arraybuffer',
        auth: { username: accountSid, password: authToken }
      });
      const filePath = path.join(UPLOADS_DIR, `${from}.jpg`);
      fs.writeFileSync(filePath, response.data);
      console.log('Imagen guardada:', filePath);

      // Responder con mensaje simple
      await client.messages.create({
        from: 'whatsapp:+14155238886',
        to: `whatsapp:+${from}`,
        body: '¡Gracias por enviar tu comprobante de pago!\nEstamos validándolo y en minutos te enviaremos tu recibo oficial de Arcángel Funeraria.'
      });
      console.log('Mensaje de texto enviado a:', from);
    } else {
      // Si es solo texto
      await client.messages.create({
        from: 'whatsapp:+14155238886',
        to: `whatsapp:+${from}`,
        body: 'Hola, por favor envía el capture de tu pago para generar tu recibo automático.'
      });
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
  console.log(`Arcangel 1.5 (modo simple) corriendo en puerto ${PORT}`);
  console.log(`Webhook: ${process.env.APP_URL}/whatsapp`);
});
