const admin = require('firebase-admin');

let serviceAccount;
try {
  serviceAccount = require('../firebase-service-account-key.json');
} catch (error) {
  console.error("ERRO FATAL: O arquivo 'firebase-service-account-key.json' não foi encontrado.");
  console.error("Por favor, baixe-o do seu console do Firebase e coloque na pasta 'server'.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports = { db, admin };