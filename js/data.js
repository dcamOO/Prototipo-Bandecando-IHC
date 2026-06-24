/* ================= CAMADA DE DADOS (BANDECANDO) =================
   Modelo compartilhado por todas as telas.

   Conceitos:
   - Grupos PADRÃO (não criados por mim): já vêm abertos em UM RU, com
     participantes fictícios. Em DEFAULT_GROUPS (somente leitura).
   - Grupos MEUS (criados por mim): em localStorage. Podem ter encontros em
     RUs diferentes, um por turno (a presença global por turno define o RU
     de cada turno) -> ex.: tarde em um RU e noite em outro.
   - Período: 'tarde' (11–13:30), 'noite' (17–19:30) ou 'ambos'.
   - PRESENÇA: minha presença é GLOBAL por turno -> no máximo 1 horário de
     tarde e 1 de noite ao mesmo tempo, em todo o sistema. Confirmar/abrir
     um horário substitui minha presença no mesmo turno (saio do anterior).
   - Um horário sem ninguém confirmado deixa de existir (o encontro fecha).
   - Overlays (localStorage):
       * memberships: grupos em que entrei  -> [groupId]
       * presence: { tarde:{groupId,ru,time,date}, noite:{...} }
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

    // Pontos de encontro possíveis (escolhidos ao abrir cada horário)
    const MEETING_POINTS = ['Entrada do RU', 'Mesas externas', 'Início da fila'];

    const TARDE = ['11:00', '11:30', '12:00', '12:30', '13:00', '13:30'];
    const NOITE = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30'];
    const HORARIOS = TARDE.concat(NOITE);

    function timesForPeriod(type) {
        if (type === 'noite') return NOITE.slice();
        if (type === 'ambos') return TARDE.concat(NOITE);
        return TARDE.slice(); // 'tarde'
    }
    function periodLabel(type) {
        return type === 'noite' ? 'Noite' : type === 'ambos' ? 'Tarde e noite' : 'Tarde';
    }
    // Turno de um horário: 'tarde' | 'noite' | null
    function turnoOf(time) {
        if (TARDE.indexOf(time) !== -1) return 'tarde';
        if (NOITE.indexOf(time) !== -1) return 'noite';
        return null;
    }

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
    // "DD/MM" a partir de um ISO (YYYY-MM-DD)
    function formatDayMonth(iso) {
        if (!iso) return '';
        const p = iso.split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}` : iso;
    }
    function isoOfDate(dt) {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    // Data limite (ISO) para criação de grupos: até 6 meses à frente de hoje.
    function maxGroupDateISO() {
        const d = new Date();
        return isoOfDate(new Date(d.getFullYear(), d.getMonth() + 6, d.getDate()));
    }

    // Datas (ISO) de Seg–Sex da semana atual. No fim de semana (sáb/dom),
    // mostra a próxima segunda a sexta.
    function weekDatesForMenu() {
        const d = new Date();
        const dow = d.getDay(); // 0=Dom..6=Sáb
        let offsetToMonday;
        if (dow === 0) offsetToMonday = 1;        // domingo -> próxima segunda
        else if (dow === 6) offsetToMonday = 2;   // sábado -> próxima segunda
        else offsetToMonday = 1 - dow;            // seg..sex -> segunda desta semana
        const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetToMonday);
        const out = {};
        ['seg', 'ter', 'qua', 'qui', 'sex'].forEach((k, i) => {
            out[k] = isoOfDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
        });
        return out;
    }

    // Normaliza nome de grupo p/ comparação: sem acentos, sem espaços extras, minúsculo.
    function normalizeName(name) {
        return (name || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
            .trim().replace(/\s+/g, ' ').toLowerCase();
    }
    // Já existe um grupo (padrão ou criado) com esse nome? (ignora maiúsc/minúsc e acentos)
    function groupNameExists(name) {
        const alvo = normalizeName(name);
        if (!alvo) return false;
        return getAllGroupsRaw().some(g => normalizeName(g.name) === alvo);
    }

    /* ================= CARDÁPIOS (por RU, semana toda) ================= */
    const MENU_DAYS = [
        { key: 'seg', label: 'Seg', full: 'Segunda-feira' },
        { key: 'ter', label: 'Ter', full: 'Terça-feira' },
        { key: 'qua', label: 'Qua', full: 'Quarta-feira' },
        { key: 'qui', label: 'Qui', full: 'Quinta-feira' },
        { key: 'sex', label: 'Sex', full: 'Sexta-feira' }
    ];

    // Guarnições/salada/sobremesa variam por dia (iguais entre RUs)
    const SIDES_BY_DAY = {
        seg: { guarnicoes: 'Arroz branco, arroz integral, feijão carioca e farofa', salada: 'Alface, tomate e cenoura ralada', sobremesa: 'Banana', sobremesaTags: [] },
        ter: { guarnicoes: 'Arroz branco, arroz integral, feijão preto e batata palha', salada: 'Repolho, beterraba e pepino', sobremesa: 'Gelatina', sobremesaTags: [] },
        qua: { guarnicoes: 'Arroz branco, arroz integral, feijão carioca e mandioca', salada: 'Alface, tomate e milho', sobremesa: 'Laranja', sobremesaTags: [] },
        qui: { guarnicoes: 'Arroz branco, arroz integral, feijão preto e polenta', salada: 'Rúcula, tomate e cenoura', sobremesa: 'Doce de leite', sobremesaTags: ['Contém Lactose'] },
        sex: { guarnicoes: 'Arroz branco, arroz integral, feijão carioca e farofa de couve', salada: 'Acelga, tomate e grão-de-bico', sobremesa: 'Maçã', sobremesaTags: [] }
    };

    // Prato principal e opção vegetariana variam por RU e por dia
    const MAINS = {
        'Restaurante Setorial I': {
            seg: { principal: 'Iscas de frango aceboladas', vegetariano: 'Estrogonofe de grão-de-bico', vegTags: ['Vegano', 'Contém Soja'] },
            ter: { principal: 'Bife à role', vegetariano: 'Hambúrguer de lentilha', vegTags: ['Vegano'] },
            qua: { principal: 'Frango assado com ervas', vegetariano: 'Quibe de abóbora', vegTags: ['Vegano'] },
            qui: { principal: 'Carne de panela', vegetariano: 'Tofu grelhado ao curry', vegTags: ['Vegano', 'Contém Soja'] },
            sex: { principal: 'Peixe ao molho de limão', vegetariano: 'Escondidinho de inhame', vegTags: ['Vegano'] }
        },
        'Restaurante Setorial II': {
            seg: { principal: 'Frango xadrez', vegetariano: 'Legumes ao curry', vegTags: ['Vegano'] },
            ter: { principal: 'Almôndegas ao sugo', vegetariano: 'Almôndegas de grão-de-bico', vegTags: ['Vegano'] },
            qua: { principal: 'Lombo suíno assado', vegetariano: 'Berinjela à parmegiana vegana', vegTags: ['Vegano'] },
            qui: { principal: 'Strogonoff de frango', vegetariano: 'Strogonoff de cogumelos', vegTags: ['Vegano'] },
            sex: { principal: 'Moqueca de peixe', vegetariano: 'Moqueca de banana-da-terra', vegTags: ['Vegano'] }
        },
        'Restaurante Saúde e Direito': {
            seg: { principal: 'Frango grelhado', vegetariano: 'Grão-de-bico ensopado', vegTags: ['Vegano'] },
            ter: { principal: 'Picadinho de carne', vegetariano: 'Soja ao molho', vegTags: ['Vegano', 'Contém Soja'] },
            qua: { principal: 'Filé de frango à milanesa', vegetariano: 'Couve-flor empanada', vegTags: ['Vegetariano'] },
            qui: { principal: 'Carne moída com legumes', vegetariano: 'Lentilha refogada', vegTags: ['Vegano'] },
            sex: { principal: 'Tilápia assada', vegetariano: 'Risoto de abóbora', vegTags: ['Vegetariano', 'Contém Lactose'] }
        },
        'Restaurante Setorial ICA': {
            seg: { principal: 'Frango ao molho pardo', vegetariano: 'Proteína de soja ao molho', vegTags: ['Vegano', 'Contém Soja'] },
            ter: { principal: 'Bife acebolado', vegetariano: 'Feijoada vegana', vegTags: ['Vegano'] },
            qua: { principal: 'Frango com quiabo', vegetariano: 'Abóbora refogada com quiabo', vegTags: ['Vegano'] },
            qui: { principal: 'Costela bovina', vegetariano: 'Cogumelos salteados', vegTags: ['Vegano'] },
            sex: { principal: 'Sardinha assada', vegetariano: 'Grão-de-bico à baiana', vegTags: ['Vegano'] }
        }
    };

    function todayDayKey() {
        // getDay(): 0=Dom..6=Sáb. Fim de semana cai na próxima segunda.
        return ['seg', 'seg', 'ter', 'qua', 'qui', 'sex', 'seg'][new Date().getDay()];
    }

    // Etiquetas de restrição vinculadas ao ITEM individual (chave normalizada -> tags).
    // Assim a tag fica presa ao alimento específico e não à categoria inteira,
    // evitando a ambiguidade de "qual item da categoria realmente tem a restrição".
    const ITEM_TAGS = {
        'doce de leite': ['Contém Lactose'],
        'farofa de couve': ['Contém Glúten'],
        'batata palha': ['Contém Glúten'],
        'polenta': ['Contém Lactose']
    };
    function tagsForItem(name) {
        return (ITEM_TAGS[normalizeName(name)] || []).slice();
    }
    // Quebra "A, B e C" em ['A','B','C'].
    function splitItems(str) {
        return (str || '').split(/\s*,\s*|\s+e\s+/).map(s => s.trim()).filter(Boolean);
    }
    // Lista de itens {name, tags}. dishTags só são aplicadas quando a categoria
    // é um prato único (1 item) — em listas, cada item carrega só suas próprias tags.
    function buildItems(str, dishTags) {
        const parts = splitItems(str);
        const single = parts.length === 1;
        return parts.map((name, i) => {
            const base = (single && i === 0 && dishTags ? dishTags.slice() : []).concat(tagsForItem(name));
            return { name: name, tags: base.filter((t, idx) => base.indexOf(t) === idx) }; // sem duplicatas
        });
    }

    function getMenu(ru, dayKey) {
        const porRU = MAINS[ru] || MAINS['Restaurante Setorial I'];
        const mains = porRU[dayKey] || porRU.seg;
        const sides = SIDES_BY_DAY[dayKey] || SIDES_BY_DAY.seg;
        return {
            // Resumo (cardápio recolhido)
            principal: mains.principal,
            vegetariano: mains.vegetariano,
            // Categorias com itens individuais e tags por item
            groups: [
                { label: 'Prato Principal', items: buildItems(mains.principal, ['Proteína']) },
                { label: 'Opção Vegetariana', items: buildItems(mains.vegetariano, mains.vegTags || []) },
                { label: 'Guarnições', items: buildItems(sides.guarnicoes) },
                { label: 'Salada', items: buildItems(sides.salada) },
                { label: 'Sobremesa', items: buildItems(sides.sobremesa, sides.sobremesaTags || []) }
            ]
        };
    }

    /* Grupos padrão (de terceiros), já abertos em seus RUs */
    const DEFAULT_GROUPS = [
        {
            id: 'g-conversa', owner: false, ru: 'Restaurante Setorial I', periodType: 'tarde',
            name: 'Conversa & Código',
            desc: 'Pessoal da computação que quer trocar ideia sobre projetos no almoço.',
            interests: ['Computação', 'Jogos', 'Música'],
            members: ['JC', 'M', 'L', 'P', 'R'],
            meetings: [
                { time: '11:00', attendees: ['JC', 'M'], point: 'Entrada do RU' },
                { time: '12:00', attendees: ['L', 'P', 'R'], point: 'Mesas externas' }
            ]
        },
        {
            id: 'g-calourada', owner: false, ru: 'Restaurante Setorial I', periodType: 'tarde',
            name: 'Calourada 2026',
            desc: 'Grupo para os novatos se conhecerem e almoçarem juntos.',
            interests: ['Amizade', 'Calouros'],
            members: ['A', 'B', 'C'],
            meetings: [
                { time: '12:30', attendees: ['A', 'B'], point: 'Início da fila' }
            ]
        },
        {
            id: 'g-vegano', owner: false, ru: 'Restaurante Setorial II', periodType: 'ambos',
            name: 'Rolê Vegano',
            desc: 'Trocando dicas sobre as opções veganas do RU de hoje.',
            interests: ['Vegano', 'Culinária'],
            members: ['V', 'G', 'T'],
            meetings: [
                { time: '13:00', attendees: ['V', 'G', 'T'], point: 'Mesas externas' },
                { time: '18:00', attendees: ['V', 'G'], point: 'Entrada do RU' }
            ]
        },
        {
            id: 'g-direito', owner: false, ru: 'Restaurante Saúde e Direito', periodType: 'tarde',
            name: 'Galera do Direito',
            desc: 'Estudantes de direito que almoçam juntos e debatem casos.',
            interests: ['Direito', 'Debate'],
            members: ['F', 'H', 'N'],
            meetings: [
                { time: '12:00', attendees: ['F', 'H'], point: 'Entrada do RU' }
            ]
        },
        {
            id: 'g-jantar', owner: false, ru: 'Restaurante Setorial ICA', periodType: 'noite',
            name: 'Jantar dos ICA',
            desc: 'Quem fica até tarde no campus e janta junto no RU.',
            interests: ['Amizade', 'Estudos'],
            members: ['D', 'E'],
            meetings: []   // existe no sistema, mas sem encontro aberto hoje
        }
    ];

    /* --------- persistência --------- */
    function readJSON(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; }
        catch (e) { return fallback; }
    }
    function getCustomGroups() { return readJSON('bandecando_custom_groups', []); }
    function saveCustomGroups(a) { localStorage.setItem('bandecando_custom_groups', JSON.stringify(a)); }
    function getPresence() { return readJSON('bandecando_presence', {}); }
    function savePresence(o) { localStorage.setItem('bandecando_presence', JSON.stringify(o)); }
    function getMemberships() { return readJSON('bandecando_memberships', []); }
    function saveMemberships(a) { localStorage.setItem('bandecando_memberships', JSON.stringify(a)); }
    function getSelectedRU() { return localStorage.getItem('bandecando_selected_ru') || RUS[0]; }

    /* --------- ponto de encontro por horário (groupId -> "ru|time" -> ponto) --------- */
    function getMeetingPointsStore() { return readJSON('bandecando_meeting_points', {}); }
    function saveMeetingPointsStore(o) { localStorage.setItem('bandecando_meeting_points', JSON.stringify(o)); }
    function meetingPointKey(ru, time) { return ru + '|' + time; }
    function setMeetingPoint(groupId, ru, time, point) {
        if (!point) return;
        const store = getMeetingPointsStore();
        store[groupId] = store[groupId] || {};
        store[groupId][meetingPointKey(ru, time)] = point;
        saveMeetingPointsStore(store);
    }
    function getMeetingPoint(groupId, ru, time) {
        const g = getMeetingPointsStore()[groupId];
        return (g && g[meetingPointKey(ru, time)]) || null;
    }

    /* --------- consultas base --------- */
    function getAllGroupsRaw() {
        const defaults = DEFAULT_GROUPS.map(g => JSON.parse(JSON.stringify(g)));
        return getCustomGroups().concat(defaults);
    }
    function getGroupById(id) { return getAllGroupsRaw().find(g => g.id === id) || null; }
    function getCreatedGroups() { return getCustomGroups(); }
    function getAllowedTimes(group) { return timesForPeriod(group ? group.periodType : 'ambos'); }

    /* --------- membros --------- */
    function isMember(groupId) {
        const g = getGroupById(groupId);
        if (g && g.owner) return true;
        return getMemberships().indexOf(groupId) !== -1;
    }
    function joinGroup(groupId) {
        const g = getGroupById(groupId);
        if (!g || g.owner) return;
        const m = getMemberships();
        if (m.indexOf(groupId) === -1) { m.push(groupId); saveMemberships(m); }
    }
    function leaveGroup(groupId) {
        saveMemberships(getMemberships().filter(id => id !== groupId));
        clearPresence(groupId);
    }
    function getParticipatingGroups() {
        return getMemberships().map(id => getGroupById(id)).filter(Boolean);
    }
    function hasAnyGroup() { return getCreatedGroups().length > 0 || getMemberships().length > 0; }
    function getMembersWithMe(group) {
        const base = (group.members || []).slice();
        if (isMember(group.id) && base.indexOf(ME) === -1) base.push(ME);
        return base;
    }

    /* --------- presença (global por turno) --------- */
    function setPresence(groupId, ru, time) {
        const turno = turnoOf(time);
        if (!turno) return;
        const p = getPresence();
        // substitui a presença do MESMO turno (em qualquer grupo) -> saio do anterior
        p[turno] = { groupId: groupId, ru: ru, time: time, date: todayISO() };
        savePresence(p);
    }
    // Remove qualquer presença minha (tarde/noite) que aponte para este grupo
    function clearPresence(groupId) {
        const p = getPresence();
        let changed = false;
        ['tarde', 'noite'].forEach(t => {
            if (p[t] && p[t].groupId === groupId) { delete p[t]; changed = true; }
        });
        if (changed) savePresence(p);
    }
    function isMyPresence(groupId, ru, time) {
        const pr = getPresence()[turnoOf(time)];
        return !!pr && pr.groupId === groupId && pr.ru === ru && pr.time === time && pr.date === todayISO();
    }

    /* --------- encontros --------- */
    // RUs em que o grupo está aberto hoje. Para grupos MEUS, cada turno pode
    // estar num RU diferente (definido pela minha presença) -> pode haver 2 RUs.
    function getGroupOpenRUs(group) {
        if (!group.owner) {
            return getMeetingsForGroupInRU(group, group.ru).length > 0 ? [group.ru] : [];
        }
        const today = todayISO();
        const pres = getPresence();
        const rus = [];
        ['tarde', 'noite'].forEach(t => {
            const pr = pres[t];
            if (pr && pr.groupId === group.id && pr.date === today && rus.indexOf(pr.ru) === -1) {
                rus.push(pr.ru);
            }
        });
        return rus;
    }
    function getGroupRU(group) {
        const rus = getGroupOpenRUs(group);
        return rus.length ? rus[0] : (group.owner ? null : group.ru);
    }

    // Encontros de um grupo, hoje, num RU. -> [{time, attendees[], point}] (sem horários vazios)
    function getMeetingsForGroupInRU(group, ru) {
        const map = {};
        const points = {};
        // Base: grupos padrão têm participantes fictícios fixos
        if (!group.owner && group.ru === ru) {
            (group.meetings || []).forEach(m => {
                map[m.time] = (map[m.time] || []).concat(m.attendees);
                if (m.point) points[m.time] = m.point;
            });
        }
        // Minha presença (1 por turno) que aponta para este grupo+RU hoje
        const pres = getPresence();
        const today = todayISO();
        ['tarde', 'noite'].forEach(turno => {
            const pr = pres[turno];
            if (pr && pr.groupId === group.id && pr.ru === ru && pr.date === today) {
                map[pr.time] = map[pr.time] || [];
                if (map[pr.time].indexOf(ME) === -1) map[pr.time].push(ME);
            }
        });
        // Horários sem ninguém confirmado desaparecem (encontro fecha)
        return Object.keys(map).sort()
            .filter(t => map[t].length > 0)
            .map(t => ({
                time: t,
                attendees: map[t],
                point: points[t] || getMeetingPoint(group.id, ru, t) || group.meetingPoint || null
            }));
    }

    // Todos os encontros de hoje do grupo, em QUALQUER RU. Cada turno (tarde/
    // noite) é um encontro independente, mesmo que no mesmo RU.
    // -> [{ ru, time, attendees[], point }] ordenado por horário.
    function getAllMeetingsForGroup(group) {
        const out = [];
        getGroupOpenRUs(group).forEach(ru => {
            getMeetingsForGroupInRU(group, ru).forEach(m => {
                out.push({ ru: ru, time: m.time, attendees: m.attendees, point: m.point });
            });
        });
        return out.sort((a, b) => a.time.localeCompare(b.time));
    }

    // Grupo "aberto" = tem encontro com gente hoje em ao menos um RU
    function isGroupOpen(group) {
        return getGroupOpenRUs(group).length > 0;
    }
    function getOpenGroupsForRU(ru) {
        return getAllGroupsRaw().filter(g => getMeetingsForGroupInRU(g, ru).length > 0);
    }
    function getOpenTimes(group, ru) { return getMeetingsForGroupInRU(group, ru).map(m => m.time); }
    function getAvailableNewTimes(group, ru) {
        const abertos = getOpenTimes(group, ru);
        return getAllowedTimes(group).filter(h => abertos.indexOf(h) === -1);
    }

    // Confirmar presença (exige ser membro -> entra automaticamente). Só se o grupo já estiver aberto.
    // Ao abrir um horário novo, recebe o ponto de encontro escolhido.
    function confirmPresence(groupId, ru, time, point) {
        const group = getGroupById(groupId);
        if (!group) return false;
        if (!isGroupOpen(group)) return false;
        if (getAllowedTimes(group).indexOf(time) === -1) return false;
        joinGroup(groupId);
        if (point) setMeetingPoint(groupId, ru, time, point);
        setPresence(groupId, ru, time); // 1 por turno -> saio do horário anterior do mesmo turno
        return true;
    }

    /* --------- ações do dono --------- */
    function createGroup(group) {
        if (groupNameExists(group.name)) return { error: 'duplicate' };
        const custom = getCustomGroups();
        group.id = 'u-' + Date.now();
        group.owner = true;
        group.periodType = group.periodType || 'ambos';
        group.members = [ME];
        group.openRU = null;
        group.openDate = null;
        custom.unshift(group);
        saveCustomGroups(custom);
        return group;
    }

    // Abre um horário do meu grupo num RU (a presença do dono cria o encontro).
    // Cada turno pode ficar num RU diferente -> dá pra abrir tarde e noite em
    // RUs distintos. Abrir um horário substitui só a presença do mesmo turno.
    function openMeeting(groupId, ru, time, point) {
        const custom = getCustomGroups();
        const g = custom.find(x => x.id === groupId);
        if (!g) return { error: 'notfound' };
        if (timesForPeriod(g.periodType).indexOf(time) === -1) return { error: 'time' };

        g.openRU = ru; g.openDate = todayISO();   // referência do último RU aberto
        saveCustomGroups(custom);
        if (point) setMeetingPoint(groupId, ru, time, point);
        setPresence(groupId, ru, time); // dono presente; sai do horário anterior do mesmo turno
        return { ok: true };
    }

    function closeMeeting(groupId) {
        const custom = getCustomGroups();
        const g = custom.find(x => x.id === groupId);
        if (!g) return;
        g.openRU = null; g.openDate = null;
        saveCustomGroups(custom);
        clearPresence(groupId);
    }

    // Fecha apenas UM encontro (turno+RU+horário) do grupo, escolhido pelo dono.
    // Os demais encontros do mesmo grupo continuam abertos.
    function closeMeetingAt(groupId, ru, time) {
        const turno = turnoOf(time);
        if (!turno) return;
        const p = getPresence();
        const pr = p[turno];
        if (pr && pr.groupId === groupId && pr.ru === ru && pr.time === time) {
            delete p[turno];
            savePresence(p);
        }
        // Se não restou nenhum encontro aberto, zera a referência de último RU
        const custom = getCustomGroups();
        const g = custom.find(x => x.id === groupId);
        if (g && getGroupOpenRUs(g).length === 0) {
            g.openRU = null; g.openDate = null;
            saveCustomGroups(custom);
        }
    }

    function deleteGroup(groupId) {
        saveCustomGroups(getCustomGroups().filter(g => g.id !== groupId));
        saveMemberships(getMemberships().filter(id => id !== groupId));
        clearPresence(groupId);
    }

    // Editar período do grupo (remove minha presença em horário fora do novo período)
    function setPeriodType(groupId, type) {
        const custom = getCustomGroups();
        const g = custom.find(x => x.id === groupId);
        if (!g) return;
        g.periodType = type;
        saveCustomGroups(custom);
        const allowed = timesForPeriod(type);
        const p = getPresence();
        let changed = false;
        ['tarde', 'noite'].forEach(t => {
            if (p[t] && p[t].groupId === groupId && allowed.indexOf(p[t].time) === -1) { delete p[t]; changed = true; }
        });
        if (changed) savePresence(p);
    }

    /* --------- busca (Encontrar grupos) --------- */
    function getAllInterests() {
        const set = {};
        getAllGroupsRaw().forEach(g => (g.interests || []).forEach(i => { set[i] = true; }));
        return Object.keys(set).sort();
    }

    window.BandecandoData = {
        ME, RUS, MEETING_POINTS, HORARIOS, TARDE, NOITE, timesForPeriod, periodLabel, turnoOf,
        todayISO, formatDateBR, formatDayMonth, maxGroupDateISO,
        weekDatesForMenu, normalizeName, groupNameExists, getSelectedRU,
        getMeetingPoint, setMeetingPoint,
        MENU_DAYS, getMenu, todayDayKey,
        getAllGroupsRaw, getGroupById, getCreatedGroups, getParticipatingGroups,
        hasAnyGroup, isMember, joinGroup, leaveGroup, getMembersWithMe,
        getGroupRU, getGroupOpenRUs, isGroupOpen, getOpenGroupsForRU, getMeetingsForGroupInRU,
        getAllMeetingsForGroup, getOpenTimes, getAvailableNewTimes, isMyPresence, getAllowedTimes,
        confirmPresence, createGroup, openMeeting, closeMeeting, closeMeetingAt, deleteGroup,
        setPeriodType, getAllInterests
    };
})();
