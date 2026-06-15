const appRoot = document.getElementById('app-root');

// Mapeamento das rotas atualizado
const rotas = {
    'splash': 'pages/splash.html',
    'welcome': 'pages/welcome.html',
    'onboarding': 'pages/onboarding.html',
    'login': 'pages/login.html',
    'ru-choice': 'pages/ru-choice.html',
    'dashboard': 'pages/dashboard.html',
    'grupos': 'pages/grupos.html',
    'grupo': 'pages/grupo.html',
    'criar-grupo': 'pages/criar-grupo.html',
    'meus-grupos': 'pages/meus-grupos.html',
    'encontrar-grupos': 'pages/encontrar-grupos.html'
};

async function nav(sceneId) {
    const arquivo = rotas[sceneId];
    if (!arquivo) return console.error('Rota não encontrada:', sceneId);

    try {
        const response = await fetch(arquivo, { cache: 'no-store' });
        if (!response.ok) throw new Error('Erro ao carregar a cena');
        
        const html = await response.text();
        appRoot.innerHTML = html;
        appRoot.parentElement.scrollTo(0, 0);

        // Recria as tags <script> para que o navegador as execute
        Array.from(appRoot.querySelectorAll('script')).forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
            newScript.appendChild(document.createTextNode(oldScript.innerHTML));
            oldScript.parentNode.replaceChild(newScript, oldScript);
        });
        
    } catch (error) {
        console.error('Falha no roteamento:', error);
    }
}

// Inicializa o app na tela de carregamento
document.addEventListener('DOMContentLoaded', () => {
    nav('splash');
});
