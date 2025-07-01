const path = require('path');

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
const USER_DATA_DIR = path.join(__dirname, '..', 'user_data');
const MEDIA_DIR = path.join(__dirname, '..', 'public', 'media');
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'dist');

module.exports = {
    SESSIONS_DIR,
    USER_DATA_DIR,
    MEDIA_DIR,
    FRONTEND_DIR
};