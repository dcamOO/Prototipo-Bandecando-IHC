# 🍽️ Bandecando

Protótipo **mobile-first** de um aplicativo para a comunidade acadêmica da UFMG que utiliza os
**Restaurantes Universitários (RUs)**. O Bandecando centraliza, numa única interface, as
informações e interações do RU para reduzir o tempo e a carga cognitiva da rotina da refeição.

> Trabalho da disciplina **Interação Humano-Computador (IHC)** — UFMG / DCC.

---

## 🎯 Objetivo

Apoiar três necessidades do dia a dia no RU:

- **Gestão de tempo** — consultar o status da fila (modelo de *crowdsourcing*, em que os
  próprios usuários reportam o tamanho da fila).
- **Decisão alimentar** — consultar o cardápio do dia/da semana e verificar restrições e
  preferências (etiquetas como *Vegano*, *Contém Lactose*, *Contém Soja*).
- **Socialização** — encontrar ou criar grupos de pessoas com interesses em comum para almoçar
  ou jantar juntos, combatendo o isolamento social — sobretudo de calouros e grupos minoritários.

---

## ✨ Funcionalidades

- **Dashboard** por RU com status da fila e **cardápio da semana** (Seg–Sex, com dia e mês da
  semana atual; no fim de semana mostra a próxima semana útil) e visão resumida/completa.
- **Grupos abertos hoje** no RU selecionado e **busca de grupos por interesse** (com filtros).
- **Criar grupo**: nome único (ignora maiúsc./minúsc. e acentos — `A = a = â = à = ã`),
  período de validade de até **6 meses**, horários possíveis (tarde/noite/ambos) e interesses.
- **Encontros (horários)**:
  - Ao abrir um horário, escolhe-se **RU → horário → ponto de encontro**.
  - O **ponto de encontro é por encontro** e aparece no card de cada horário.
  - Um grupo pode ter encontros em **RUs diferentes por turno** (ex.: tarde num RU e noite em outro).
- **Confirmar presença** num horário (entra no grupo automaticamente).
- **Gerenciar meus grupos**: abrir/fechar encontros, adicionar horários, sair e excluir grupos.

> ⚠️ Protótipo de avaliação de IHC: os dados são **fictícios** e persistidos apenas no
> `localStorage` do navegador (não há back-end).

---

## 🛠️ Tecnologias

- **HTML, CSS e JavaScript (Vanilla)** — sem frameworks nem build.
- Arquitetura **SPA** com roteador próprio que injeta fragmentos de tela no shell.

---

## 📁 Estrutura

```
.
├── index.html          # Shell da aplicação (contém apenas #app-root)
├── css/
│   └── global.css      # Variáveis de design e estilos base
├── js/
│   ├── data.js         # Camada de dados (grupos, encontros, presença, cardápios)
│   └── router.js       # Roteador: fetch + injeção dos fragmentos de tela
├── pages/              # Fragmentos de tela (sem <html>/<head>/<body>)
│   ├── splash.html · welcome.html · onboarding.html · login.html
│   ├── ru-choice.html · dashboard.html
│   ├── grupos.html · encontrar-grupos.html · grupo.html
│   ├── criar-grupo.html · meus-grupos.html
└── assets/             # Logos e imagens
```

---

## 🚀 Como executar

É necessário um servidor HTTP local (a API `fetch` do roteador não funciona via `file://`).
Na raiz do projeto:

```bash
# Python
python -m http.server 8000

# ou Node
npx live-server
```

Acesse: <http://localhost:8000>

---

## 🧭 Fluxo de telas

```
splash → welcome → onboarding → login → ru-choice → dashboard
                                                      ├── grupos ──┬── encontrar-grupos ── grupo
                                                      │            └── criar-grupo
                                                      └── meus-grupos ── grupo
```

---

## 🧩 Modelo de dados (resumo)

Definido em [`js/data.js`](js/data.js) e exposto em `window.BandecandoData`:

- **Grupos padrão** (de terceiros): já vêm abertos em um RU, com participantes fictícios
  (somente leitura).
- **Grupos meus** (criados por mim): salvos no `localStorage`.
- **Presença**: global por turno — no máximo **1 horário de tarde e 1 de noite** ao mesmo tempo
  em todo o sistema. Abrir/confirmar um horário substitui a presença do mesmo turno. Como cada
  turno é independente, um grupo pode estar aberto em **RUs diferentes por turno**.
- **Ponto de encontro**: armazenado por encontro (`grupo + RU + horário`).
- Um horário sem ninguém confirmado deixa de existir (o encontro fecha).

Chaves no `localStorage`: `bandecando_custom_groups`, `bandecando_presence`,
`bandecando_memberships`, `bandecando_meeting_points`, `bandecando_selected_ru`.

---

## 👥 Autores

- Daniel Canton Alvim Moreira
- Maria Carvalhido Izabel Barreto
- Pedro Henrique E. Dalla-Lana
- Thiago Henrique Silva de Almeida
