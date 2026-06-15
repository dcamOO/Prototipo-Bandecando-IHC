/* ================= CAMADA DE DADOS (BANDECANDO) =================
   Modelo compartilhado por todas as telas.

   Conceitos:
   - Grupos PADRÃO (não criados por mim): já vêm abertos em UM RU, com
     encontros e participantes. Ficam em DEFAULT_GROUPS (somente leitura).
   - Grupos MEUS (criados por mim): em localStorage. Cada um pode estar
     aberto em NO MÁXIMO UM RU por vez (openRU), com vários horários (times).
   - Overlays do usuário (localStorage):
       * extra: horários que EU abri em qualquer grupo  -> [{groupId, ru, time}]
       * presence: minha presença ÚNICA por grupo        -> { groupId: {ru, time} }
*/
(function () {
    'use strict';

    const ME = 'Eu';

    const RUS = [
        'Restaurante Setorial I',
        'Restaurante Setorial II',
        'Restaurante Saúde e Direito',
        'Restaurante Setorial ICA'
    ];

    // Almoço (11–13:30) + jantar (17–19:30), de 30 em 30 minutos
    const HORARIOS = [
        '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
        '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'
    ];

    function todayISO() {
        const d = new Date();
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
    }

    function formatDateBR(iso) {
        if (!iso) return '';
        const p = iso.split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
    }

    /* Grupos padrão (de terceiros), já abertos em seus RUs */
    const DEFAULT_GROUPS = [
        {
            id: 'g-conversa', owner: false, ru: 'Restaurante Setorial I',
            name: 'Conversa & Código',
            desc: 'Pessoal da computação que quer trocar ideia sobre projetos no almoço.',
            interests: ['Computação', 'Jogos', 'Música'],
            members: ['JC', 'M', 'L', 'P'],
            meetings: [
                { time: '11:00', attendees: ['JC', 'M'] },
                { time: '12:00', attendees: ['L', 'P', 'R'] }
            ]
        },
        {
            id: 'g-calourada', owner: false, ru: 'Restaurante Setorial I',
            name: 'Calourada 2026',
            desc: 'Grupo para os novatos se conhecerem e almoçarem juntos.',
            interests: ['Amizade', 'Calouros'],
            members: ['A', 'B', 'C'],
            meetings: [
                { time: '12:30', attendees: ['A', 'B'] }
            ]
        },
        {
            id: 'g-vegano', owner: false, ru: 'Restaurante Setorial II',
            name: 'Rolê Vegano',
            desc: 'Trocando dicas sobre as opções veganas do RU de hoje.',
            interests: ['Vegano', 'Culinária'],
            members: ['V', 'G'],
            meetings: [
                { time: '13:00', attendees: ['V', 'G', 'T'] },
                { time: '18:00', attendees: ['V'] }
            ]
        },
        {
            id: 'g-direito', owner: false, ru: 'Restaurante Saúde e Direito',
            name: 'Galera do Direito',
            desc: 'Estudantes de direito que almoçam juntos e debatem casos.',
            interests: ['Direito', 'Debate'],
            members: ['F', 'H', 'N'],
            meetings: [
                { time: '12:00', attendees: ['F', 'H'] }
            ]
        }
    ];

    /* --------- persistência --------- */
    function readJSON(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; }
        catch (e) { return fallback; }
    }
    function getCustomGroups() { return readJSON('bandecando_custom_groups', []); }
    function saveCustomGroups(a) { localStorage.setItem('bandecando_custom_groups', JSON.stringify(a)); }

    function getExtra() { return readJSON('bandecando_extra_meetings', []); }
    function saveExtra(a) { localStorage.setItem('bandecando_extra_meetings', JSON.stringify(a)); }

    function getPresence() { return readJSON('bandecando_presence', {}); }
    function savePresence(o) { localStorage.setItem('bandecando_presence', JSON.stringify(o)); }

    function getSelectedRU() { return localStorage.getItem('bandecando_selected_ru') || RUS[0]; }

    /* --------- consultas --------- */
    function getAllGroupsRaw() {
        const defaults = DEFAULT_GROUPS.map(g => JSON.parse(JSON.stringify(g)));
        return getCustomGroups().concat(defaults);
    }
    function getGroupById(id) { return getAllGroupsRaw().find(g => g.id === id) || null; }
    function getMyGroups() { return getCustomGroups(); }

    // Encontros (mesclados) de um grupo, hoje, num RU. -> [{time, attendees[]}]
    function getMeetingsForGroupInRU(group, ru) {
        const today = todayISO();
        const map = {}; // time -> attendees[]

        if (group.owner) {
            // grupo meu: aberto só no openRU de hoje
            if (group.openRU === ru && group.openDate === today) {
                (group.times || []).forEach(t => { map[t] = map[t] || []; });
            }
        } else {
            // grupo padrão: aberto no seu próprio RU
            if (group.ru === ru) {
                (group.meetings || []).forEach(m => {
                    map[m.time] = (map[m.time] || []).concat(m.attendees);
                });
            }
        }

        // Horários que EU abri neste grupo/RU
        getExtra().forEach(e => {
            if (e.groupId === group.id && e.ru === ru) map[e.time] = map[e.time] || [];
        });

        // Minha presença (única por grupo)
        const p = getPresence()[group.id];
        if (p && p.ru === ru) {
            map[p.time] = map[p.time] || [];
            if (!map[p.time].includes(ME)) map[p.time].push(ME);
        }

        return Object.keys(map).sort().map(t => ({ time: t, attendees: map[t] }));
    }

    function getOpenGroupsForRU(ru) {
        return getAllGroupsRaw().filter(g => getMeetingsForGroupInRU(g, ru).length > 0);
    }

    function getOpenTimes(group, ru) { return getMeetingsForGroupInRU(group, ru).map(m => m.time); }
    function getAvailableNewTimes(group, ru) {
        const abertos = getOpenTimes(group, ru);
        return HORARIOS.filter(h => abertos.indexOf(h) === -1);
    }
    function getMyPresenceTime(groupId, ru) {
        const p = getPresence()[groupId];
        return (p && p.ru === ru) ? p.time : null;
    }

    /* --------- presença --------- */
    function setPresence(groupId, ru, time) {
        const p = getPresence();
        p[groupId] = { ru: ru, time: time };  // substitui -> some do horário anterior
        savePresence(p);
    }
    function clearPresence(groupId) {
        const p = getPresence();
        delete p[groupId];
        savePresence(p);
    }

    /* --------- ações de qualquer usuário --------- */
    // Confirmar presença num horário; se ainda não existe, abre-o
    function confirmPresence(groupId, ru, time) {
        const group = getGroupById(groupId);
        if (!group) return;
        const existe = getOpenTimes(group, ru).indexOf(time) !== -1;
        if (!existe) {
            const extra = getExtra();
            if (!extra.some(e => e.groupId === groupId && e.ru === ru && e.time === time)) {
                extra.push({ groupId: groupId, ru: ru, time: time });
                saveExtra(extra);
            }
        }
        setPresence(groupId, ru, time);   // presença única
    }

    /* --------- ações do dono --------- */
    function createGroup(group) {
        const custom = getCustomGroups();
        group.id = 'u-' + Date.now();
        group.owner = true;
        group.openRU = null;
        group.openDate = null;
        group.times = [];      // só aparece em "abertos hoje" após abrir um encontro
        custom.unshift(group);
        saveCustomGroups(custom);
        return group;
    }

    // Abre/agrega um horário ao encontro. 1 grupo só pode abrir em 1 RU por vez.
    function openMeeting(groupId, ru, time) {
        const custom = getCustomGroups();
        const g = custom.find(x => x.id === groupId);
        if (!g) return { error: 'notfound' };
        const today = todayISO();

        if (g.openRU && g.openDate === today && g.openRU !== ru) {
            return { error: 'other-ru', ru: g.openRU };
        }
        if (g.openDate !== today) { g.openRU = null; g.times = []; }

        g.openRU = ru;
        g.openDate = today;
        g.times = g.times || [];
        if (g.times.indexOf(time) === -1) g.times.push(time);
        saveCustomGroups(custom);

        setPresence(groupId, ru, time); // dono fica presente no horário aberto
        return { ok: true };
    }

    // Troca o RU do encontro (fecha o atual e abre no novo)
    function changeRU(groupId, newRU, time) {
        const custom = getCustomGroups();
        const g = custom.find(x => x.id === groupId);
        if (!g) return;
        // limpa horários abertos por mim no RU antigo
        saveExtra(getExtra().filter(e => e.groupId !== groupId));
        g.openRU = newRU;
        g.openDate = todayISO();
        g.times = time ? [time] : [];
        saveCustomGroups(custom);
        setPresence(groupId, newRU, time);
    }

    // Fecha o encontro (grupo continua existindo, mas sai dos "abertos")
    function closeMeeting(groupId) {
        const custom = getCustomGroups();
        const g = custom.find(x => x.id === groupId);
        if (!g) return;
        g.openRU = null;
        g.openDate = null;
        g.times = [];
        saveCustomGroups(custom);
        saveExtra(getExtra().filter(e => e.groupId !== groupId));
        clearPresence(groupId);
    }

    // Exclui o grupo de vez
    function deleteGroup(groupId) {
        saveCustomGroups(getCustomGroups().filter(g => g.id !== groupId));
        saveExtra(getExtra().filter(e => e.groupId !== groupId));
        clearPresence(groupId);
    }

    window.BandecandoData = {
        ME, RUS, HORARIOS, todayISO, formatDateBR, getSelectedRU,
        getGroupById, getMyGroups, getOpenGroupsForRU, getMeetingsForGroupInRU,
        getOpenTimes, getAvailableNewTimes, getMyPresenceTime,
        confirmPresence, createGroup, openMeeting, changeRU, closeMeeting, deleteGroup
    };
})();
