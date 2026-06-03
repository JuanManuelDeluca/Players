// ─────────────────────────────────────────────
// GOOGLE DRIVE / DOCS HELPERS
// ─────────────────────────────────────────────

// Convierte link de Drive a URL embebible en <img>
// Formatos soportados:
//   https://drive.google.com/file/d/ID/view...
//   https://drive.google.com/open?id=ID
function convertDriveImageUrl(url) {
  if (!url) return url;
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return `https://lh3.googleusercontent.com/d/${fileMatch[1]}`;
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
  return url;
}

// Extrae el ID de un link de Google Docs
function extractDocsId(url) {
  const m = (url || '').match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// Escapa HTML y convierte saltos de línea a <br> para preservar formato
function textToHtml(text) {
  return text
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// Si el valor es un link de Google Docs, descarga el texto plano.
// El documento debe estar compartido como "cualquiera con el enlace puede ver".
async function resolveDescription(value) {
  const id = extractDocsId(value);
  if (!id) return value;
  try {
    const res = await fetch(
      `https://docs.google.com/document/d/${id}/export?format=txt`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.text()).trim();
  } catch {
    return '';
  }
}

// ─────────────────────────────────────────────
// CONFIGURACIÓN GOOGLE SHEETS
// ─────────────────────────────────────────────
// 1. Crea tu hoja con estas columnas (fila 1 = encabezados):
//    nombre | foto | posicion | disponibilidad | descripcion | video
// 2. Archivo → Compartir → Publicar en la web → CSV
// 3. Pegá la URL aquí:
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1TWntlnHPG7ogpIjC2J06-WGtRlji4oKdXoiLMHFSmE8/export?format=csv';  // <-- pegar URL aquí

// ─────────────────────────────────────────────
// FILTROS: posiciones
// ─────────────────────────────────────────────
const POSITIONS = [
  { value: 'all',       label: 'Todas'      },
  { value: 'Base',      label: 'Base'       },
  { value: 'Escolta',   label: 'Escolta'    },
  { value: 'Alero',     label: 'Alero'      },
  { value: 'Ala-Pivot', label: 'Ala-Pivot' },
  { value: 'Pivot',     label: 'Pivot'      },
];

// ─────────────────────────────────────────────
// INICIALIZACIÓN DE FILTROS
// ─────────────────────────────────────────────
function buildFilters() {
  const posSelect    = document.getElementById('filter-position');
  const genderSelect = document.getElementById('filter-gender');

  POSITIONS.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    posSelect.appendChild(opt);
  });

  const searchInput  = document.getElementById('filter-search');
  const sub21Select = document.getElementById('filter-sub21');

  posSelect.addEventListener('change', renderPlayers);
  genderSelect.addEventListener('change', renderPlayers);
  searchInput.addEventListener('input', renderPlayers);
  sub21Select.addEventListener('change', renderPlayers);
}

// ─────────────────────────────────────────────
// CARGA DESDE GOOGLE SHEETS (CSV)
// ─────────────────────────────────────────────
function splitCSVRow(row) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const char of row) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text) {
  const [headerLine, ...rows] = text.trim().split('\n');
  const headers = splitCSVRow(headerLine).map(h => h.toLowerCase());

  return rows
    .filter(row => row.trim())
    .map(row => {
      const cols = splitCSVRow(row);
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = cols[i] || '';
      });
      return {
        name:           obj['nombre']         || '',
        photo:          convertDriveImageUrl(obj['foto'] || ''),
        position:       obj['posicion']       || '',
        club:           obj['club']           || '',
        descriptionUrl: obj['descripcion']    || '',
        description:    obj['descripcion']    || '',
        video:          obj['video']          || '',
        gender:         obj['sexo']           || '',
        birthDate:      obj['fecha de nacimiento'] || '',
      };
    })
    .filter(p => p.name);
}

async function loadPlayers() {
  if (!SHEET_CSV_URL) {
    console.warn('Sin URL de Google Sheets configurada.');
    return [];
  }

  try {
    const res = await fetch(SHEET_CSV_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const players = parseCSV(text);
    if (!players.length) throw new Error('La hoja está vacía');

    // Descarga el texto de cada descripción que sea un link de Google Docs
    await Promise.all(players.map(async p => {
      p.description = await resolveDescription(p.descriptionUrl);
    }));

    console.info(`${players.length} jugadores cargados desde Google Sheets.`);
    return players;
  } catch (err) {
    console.error('No se pudo cargar Google Sheets:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// LÓGICA SUB-21
// ─────────────────────────────────────────────

// Devuelve el año de nacimiento mínimo para ser Sub-21 en una liga.
// Regla: sos Sub-21 en todo el torneo si cumplís 21 en el año en que ESE torneo termina.
// Federal y Prefederal son de un solo año; Liga Nac/Arg usa el año de cierre (el más alto).
function getSub21CutoffYear(leagueType) {
  const today = new Date();
  const year  = today.getFullYear();
  const month = today.getMonth() + 1; // 1-12

  let refYear;

  if (leagueType === 'federal') {
    // Feb–ago del año Y; si ya pasó agosto, la próxima es el año que viene
    refYear = (month >= 2 && month <= 8) ? year : year + 1;
  } else if (leagueType === 'prefederal') {
    // Ago–dic del año Y
    refYear = year;
  } else if (leagueType === 'liganac') {
    // Oct(Y)–jun(Y+1): referencia = año de INICIO (Y)
    // ene–jun: la temporada arrancó en oct del año pasado
    // jul–dic: la temporada arranca/arrancó en oct de este año
    refYear = (month <= 6) ? year - 1 : year;
  }

  return refYear - 21;
}

function isSub21(birthDateStr, leagueType) {
  if (!birthDateStr) return false;
  const parts = birthDateStr.split('/');
  if (parts.length !== 3) return false;
  const birthYear = parseInt(parts[2], 10);
  if (!birthYear) return false;
  return birthYear >= getSub21CutoffYear(leagueType);
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────
let allPlayers = [];

function renderPlayers() {
  const pos    = document.getElementById('filter-position').value;
  const gender = document.getElementById('filter-gender').value;
  const search = document.getElementById('filter-search').value.trim().toLowerCase();
  const sub21 = document.getElementById('filter-sub21').value;
  const grid  = document.getElementById('players-grid');

  const filtered = allPlayers.filter(p => {
    const playerPositions = p.position.split('/').map(s => s.trim().toLowerCase());
    const matchPos    = pos    === 'all' || playerPositions.includes(pos.toLowerCase());
    const matchGender = gender === 'all' || p.gender.toLowerCase() === gender;
    const matchSearch = !search || p.name.toLowerCase().includes(search);
    const matchSub21  = sub21  === 'all' || isSub21(p.birthDate, sub21);
    return matchPos && matchGender && matchSearch && matchSub21;
  });

  grid.innerHTML = '';

  if (!filtered.length) {
    grid.innerHTML = '<p class="no-results">No se encontraron jugadores con esos filtros.</p>';
    return;
  }

  filtered.forEach(player => {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.innerHTML = `
      <img src="${player.photo}" alt="Foto de ${player.name}" />
      <div class="card-body">
        <h3>${player.name}</h3>
        <div class="badges">
          <span class="badge badge-position">${player.position}</span>
          ${player.club ? `<span class="badge badge-club">${player.club}</span>` : ''}
        </div>
        <p>${textToHtml(player.description)}</p>
      </div>
    `;
    card.addEventListener('click', () => {
      const p = new URLSearchParams({
        name:           player.name,
        photo:          player.photo,
        position:       player.position,
        club:           player.club,
        descriptionUrl: player.descriptionUrl,
        video:          player.video,
      });
      location.href = `player.html?${p.toString()}`;
    });
    grid.appendChild(card);
  });
}

// ─────────────────────────────────────────────
// ARRANQUE
// ─────────────────────────────────────────────
async function init() {
  buildFilters();
  allPlayers = await loadPlayers();
  renderPlayers();
}

init();
