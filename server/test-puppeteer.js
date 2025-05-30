const puppeteer = require('puppeteer');

(async () => {
  try {
    console.log('Tentando iniciar o Puppeteer...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('Puppeteer iniciado com sucesso!');
    const page = await browser.newPage();
    console.log('Nova página criada.');
    await page.goto('https://www.google.com');
    console.log('Navegou para Google.');
    await browser.close();
    console.log('Navegador fechado.');
  } catch (e) {
    console.error('Erro no teste do Puppeteer:', e);
  }
})();