const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { admin } = require('./firebase');
const { startWhatsAppSession, sessions, qrCodes } = require('./whatsapp');
const { MEDIA_DIR, SESSIONS_DIR } = require('./paths');

async function authenticateFirebaseToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);

  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    return res.sendStatus(403);
  }
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const userId = req.user?.uid;
        if (!userId) {
            return cb(new Error('Usuário não autenticado'), '');
        }
        const userMediaDir = path.join(MEDIA_DIR, userId);
        if (!fs.existsSync(userMediaDir)) {
            fs.mkdirSync(userMediaDir, { recursive: true });
        }
        cb(null, userMediaDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

function initializeRoutes(app, io) {
    app.post('/api/whatsapp/connect', authenticateFirebaseToken, (req, res) => {
        startWhatsAppSession(io, req.user.uid, null).catch(err => console.error(`Erro ao iniciar sessão para ${req.user.uid}:`, err));
        res.status(200).json({ message: 'Tentando reconectar...' });
    });

    app.post('/api/whatsapp/upload-media', authenticateFirebaseToken, upload.single('mediaFile'), (req, res) => {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
        }
        const relativePath = path.join(req.user.uid, req.file.filename);
        res.json({
            success: true,
            message: 'Upload bem-sucedido!',
            filePath: relativePath,
            mimetype: req.file.mimetype,
            originalName: req.file.originalname
        });
    });

    app.post('/api/whatsapp/request-pairing-code', authenticateFirebaseToken, (req, res) => {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ message: 'Número de telefone é obrigatório.' });
        }
        startWhatsAppSession(io, req.user.uid, phoneNumber).catch(err => console.error(`Erro ao iniciar sessão com pairing code para ${req.user.uid}:`, err));
        res.status(200).json({ message: 'Solicitação de código enviada...' });
    });

    app.post('/api/whatsapp/logout', authenticateFirebaseToken, async (req, res) => {
        const userId = req.user.uid;
        if (sessions[userId]) {
            await sessions[userId].logout();
        }
        const sessionFolderPath = path.join(SESSIONS_DIR, userId);
        if (fs.existsSync(sessionFolderPath)) {
            fs.rmSync(sessionFolderPath, { recursive: true, force: true });
        }
        res.status(200).json({ message: 'Sessão encerrada com sucesso.' });
    });
}

module.exports = { initializeRoutes };