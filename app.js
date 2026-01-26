let KANJI_METADATA = {};
let KANJI_LIST = [];

// Load metadata from external file
async function loadMetadata() {
  try {
    const response = await fetch('kanji_metadata.json');
    KANJI_METADATA = await response.json();
    
    // Build KANJI_LIST from metadata
    KANJI_LIST = Object.keys(KANJI_METADATA);
    
    console.log('Kanji metadata loaded:', KANJI_LIST.length, 'kanji');
    
    // Initialize app after metadata is loaded
    if (app && app.onMetadataLoaded) {
      app.onMetadataLoaded();
    }
  } catch (error) {
    console.error('Failed to load kanji metadata:', error);
  }
}

// Load metadata on page load
loadMetadata();

let translations = { ja: {}, en: {} };

// Load translations from CSV file
async function loadTranslations() {
  try {
    const response = await fetch('translations.csv');
    const csvText = await response.text();
    const lines = csvText.split('\n');
    
    // Parse CSV properly
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim() === '') continue;
      
      // Split by comma (handles basic CSV)
      const parts = line.split(',');
      if (parts.length >= 3) {
        const key = parts[0].trim();
        const ja = parts[1];
        const en = parts.slice(2).join(','); // In case English has commas
        
        translations.ja[key] = ja;
        translations.en[key] = en;
      }
    }
    
    console.log('Translations loaded:', Object.keys(translations.ja).length, 'keys');
    // Re-apply translations after loading
    if (app && app.applyTranslations) {
      app.applyTranslations();
    }
  } catch (error) {
    console.error('Failed to load translations:', error);
  }
}

// Load translations on page load
loadTranslations();



const app = {
  kanjiData: {},
  currentKanji: null,
  studyQueue: [],
  currentIndex: 0,
  currentKanjiFullData: null,
  nextKanjiData: null, // Cache for pre-fetched next card
  language: 'ja',
  savedSession: null, // Track saved study session
  studyMode: 'detailed', // 'simple' or 'detailed'
  
  init() {
    this.loadLanguage();
    this.loadDarkMode();
    this.loadStudyMode();
    this.loadTogglePreferences();
    this.loadSavedSession();
    this.loadFiltersState();
    this.setupEventListeners();
    this.applyTranslations();
    // Don't load data or render grid yet - wait for metadata
  },
  
  onMetadataLoaded() {
    // Called after KANJI_METADATA is loaded
    this.loadData();
    this.loadGridSortPreference();
    this.renderGrid();
    this.updateStats();
  },
  
  loadSavedSession() {
    const saved = localStorage.getItem('savedStudySession');
    if (saved) {
      this.savedSession = JSON.parse(saved);
    }
  },
  
  saveSession() {
    if (this.studyQueue.length > 0 && this.currentIndex < this.studyQueue.length) {
      const session = {
        studyQueue: this.studyQueue,
        currentIndex: this.currentIndex,
        filter: document.getElementById('level-filter').value,
        sort: document.getElementById('sort-option').value,
        limit: document.getElementById('study-limit').value,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('savedStudySession', JSON.stringify(session));
      this.savedSession = session;
    }
  },
  
  clearSession() {
    localStorage.removeItem('savedStudySession');
    this.savedSession = null;
  },
  
  autoResumeOrStart() {
    // If we have a saved session, restore it automatically
    if (this.savedSession && this.savedSession.studyQueue.length > 0) {
      // Restore the session
      this.studyQueue = this.savedSession.studyQueue;
      this.currentIndex = this.savedSession.currentIndex;
      
      // Restore the controls
      document.getElementById('level-filter').value = this.savedSession.filter;
      document.getElementById('sort-option').value = this.savedSession.sort;
      document.getElementById('study-limit').value = this.savedSession.limit;
      
      // Show the study card
      document.getElementById('study-card').style.display = 'flex';
      document.getElementById('no-kanji').style.display = 'none';
      
      // Clear any old answer data
      document.getElementById('kanji-info').classList.remove('visible');
      document.getElementById('rating-buttons').classList.remove('visible');
      document.getElementById('show-answer-btn').style.display = 'block';
      document.getElementById('kanji-reading').innerHTML = '';
      document.getElementById('kanji-meaning').textContent = '';
      document.getElementById('kanji-examples').innerHTML = '';
      
      // Update progress counter
      this.updateProgressCounter();
      
      // Show the card
      this.showCard();
    } else {
      // No saved session, start fresh
      this.startStudy();
    }
  },
  
  loadLanguage() {
    const saved = localStorage.getItem('language');
    if (saved) {
      this.language = saved;
    }
  },
  
  toggleLanguage() {
    this.language = this.language === 'ja' ? 'en' : 'ja';
    localStorage.setItem('language', this.language);
    document.getElementById('language-btn').textContent = this.language === 'ja' ? 'EN' : '日本語';
    this.applyTranslations();
    this.renderGrid(); // Re-render grid to update tooltips
    this.updateProgressCounter(); // Update progress counter
  },
  
  loadDarkMode() {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true') {
      document.body.classList.add('dark-mode');
      document.getElementById('dark-mode-btn').textContent = '☀️';
    }
  },
  
  toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
    
    // Update icon
    document.getElementById('dark-mode-btn').textContent = isDark ? '☀️' : '🌙';
  },
  
  t(key) {
    return translations[this.language][key] || key;
  },
  
  applyTranslations() {
    // Header
    document.querySelector('h1').textContent = this.t('title');
    document.querySelectorAll('.tab-btn')[0].textContent = this.t('gridView');
    document.querySelectorAll('.tab-btn')[1].textContent = this.t('studyMode');
    document.getElementById('language-btn').textContent = this.language === 'ja' ? 'EN' : '日本語';
    document.getElementById('export-btn').textContent = this.t('exportData');
    document.getElementById('import-btn').textContent = this.t('importData');
    
    // Legend
    const legendItems = document.querySelectorAll('.legend-item span');
    legendItems[0].textContent = this.t('unknown');
    legendItems[1].textContent = this.t('learning');
    legendItems[2].textContent = this.t('familiar');
    legendItems[3].textContent = this.t('known');
    legendItems[4].textContent = this.t('mastered');
    
    // Grid sort
    document.getElementById('label-grid-sort').textContent = this.t('gridSort');
    document.getElementById('grid-sort-default').textContent = this.t('gridSortDefault');
    document.getElementById('grid-sort-frequency').textContent = this.t('gridSortFrequency');
    document.getElementById('grid-sort-grade').textContent = this.t('gridSortGrade');
    document.getElementById('grid-sort-jlpt').textContent = this.t('gridSortJlpt');
    document.getElementById('grid-sort-strokes').textContent = this.t('gridSortStrokes');
    document.getElementById('grid-sort-proficiency').textContent = this.t('gridSortProficiency');
    
    // Study labels
    document.getElementById('toggle-filters-text').textContent = this.t('toggleFilters');
    document.getElementById('label-filter').textContent = this.t('levelFilter');
    document.getElementById('label-jlpt').textContent = this.t('jlptFilter');
    document.getElementById('label-grade').textContent = this.t('gradeFilter');
    document.getElementById('label-strokes').textContent = this.t('strokeFilter');
    document.getElementById('label-sort').textContent = this.t('sortBy');
    document.getElementById('label-limit').textContent = this.t('studyLimit');
    
    // Filter all options
    document.getElementById('jlpt-all').textContent = this.t('allJlpt');
    document.getElementById('grade-all').textContent = this.t('allGrade');
    document.getElementById('stroke-all').textContent = this.t('allStrokes');
    
    // JLPT options
    document.getElementById('jlpt-5').textContent = this.t('jlpt5');
    document.getElementById('jlpt-4').textContent = this.t('jlpt4');
    document.getElementById('jlpt-3').textContent = this.t('jlpt3');
    document.getElementById('jlpt-2').textContent = this.t('jlpt2');
    document.getElementById('jlpt-1').textContent = this.t('jlpt1');
    
    // Grade options
    document.getElementById('grade-1').textContent = this.t('grade1');
    document.getElementById('grade-2').textContent = this.t('grade2');
    document.getElementById('grade-3').textContent = this.t('grade3');
    document.getElementById('grade-4').textContent = this.t('grade4');
    document.getElementById('grade-5').textContent = this.t('grade5');
    document.getElementById('grade-6').textContent = this.t('grade6');
    document.getElementById('grade-8').textContent = this.t('grade8');
    
    // Stroke options
    document.getElementById('stroke-1-5').textContent = this.t('strokes1_5');
    document.getElementById('stroke-6-10').textContent = this.t('strokes6_10');
    document.getElementById('stroke-11-15').textContent = this.t('strokes11_15');
    document.getElementById('stroke-16-20').textContent = this.t('strokes16_20');
    document.getElementById('stroke-21plus').textContent = this.t('strokes21plus');
    
    // Sort options
    document.getElementById('sort-random').textContent = this.t('random');
    document.getElementById('sort-frequency').textContent = this.t('frequency');
    document.getElementById('sort-level').textContent = this.t('proficiency');
    
    // Checkbox labels - need to preserve the checkbox input
    const kunCheckbox = document.getElementById('show-kun');
    const onCheckbox = document.getElementById('show-on');
    const meaningCheckbox = document.getElementById('show-meaning');
    const examplesCheckbox = document.getElementById('show-examples');
    const strokeCheckbox = document.getElementById('show-stroke-order');
    
    document.getElementById('label-kun').innerHTML = `<input type="checkbox" id="show-kun" ${kunCheckbox.checked ? 'checked' : ''} onchange="app.saveTogglePreferences(); app.updateDisplay()"> ${this.t('kunReading')}`;
    document.getElementById('label-on').innerHTML = `<input type="checkbox" id="show-on" ${onCheckbox.checked ? 'checked' : ''} onchange="app.saveTogglePreferences(); app.updateDisplay()"> ${this.t('onReading')}`;
    document.getElementById('label-meaning').innerHTML = `<input type="checkbox" id="show-meaning" ${meaningCheckbox.checked ? 'checked' : ''} onchange="app.saveTogglePreferences(); app.updateDisplay()"> ${this.t('meaning')}`;
    document.getElementById('label-examples').innerHTML = `<input type="checkbox" id="show-examples" ${examplesCheckbox.checked ? 'checked' : ''} onchange="app.saveTogglePreferences(); app.updateDisplay()"> ${this.t('examples')}`;
    document.getElementById('label-stroke').innerHTML = `<input type="checkbox" id="show-stroke-order" ${strokeCheckbox.checked ? 'checked' : ''} onchange="app.saveTogglePreferences(); app.updateDisplay()"> ${this.t('strokeOrder')}`;
    
    const contextCheckbox = document.getElementById('show-in-context');
    document.getElementById('label-context').innerHTML = `<input type="checkbox" id="show-in-context" ${contextCheckbox.checked ? 'checked' : ''} onchange="app.saveTogglePreferences(); app.updateContextDisplay()"> ${this.t('showInContext')}`;
    
    // Show answer button
    document.getElementById('show-answer-btn').textContent = this.t('showAnswer');
    
    // Study mode buttons
    document.getElementById('simple-mode-text').textContent = this.t('simpleMode');
    document.getElementById('detailed-mode-text').textContent = this.t('detailedMode');
    this.updateModeButtons();
    
    // Mobile nav buttons
    const mobileGridBtn = document.getElementById('mobile-grid-btn');
    const mobileSettingsBtn = document.getElementById('mobile-settings-btn');
    if (mobileGridBtn) mobileGridBtn.textContent = `← ${this.t('mobileGrid')}`;
    if (mobileSettingsBtn) mobileSettingsBtn.textContent = '⚙️'; // Keep gear icon
    
    // Stats
    document.getElementById('stat-total').textContent = this.t('totalKanji');
    document.getElementById('stat-mastered').textContent = this.t('mastered');
    document.getElementById('stat-progress').textContent = this.t('inProgress');
    document.getElementById('stat-unknown').textContent = this.t('unknownCount');
    
    // Rating buttons
    document.getElementById('rating-again').textContent = this.t('again');
    document.getElementById('rating-hard').textContent = this.t('hard');
    document.getElementById('rating-good').textContent = this.t('good');
    document.getElementById('rating-easy').textContent = this.t('easy');
    document.getElementById('rating-learning').textContent = this.t('learning');
    document.getElementById('rating-familiar').textContent = this.t('familiar');
    document.getElementById('rating-known').textContent = this.t('known');
    document.getElementById('rating-mastered').textContent = this.t('mastered');
    
    // Update filter counts to use current language
    this.updateFilterCounts();
    
    // No kanji messages
    document.getElementById('no-kanji-msg').textContent = this.t('noKanji');
    document.getElementById('no-kanji-hint').textContent = this.t('adjustFilters');
    
    // Drop overlay
    document.querySelector('.drop-message').textContent = this.t('dropJson');
  },
  
  loadTogglePreferences() {
    const prefs = localStorage.getItem('togglePreferences');
    if (prefs) {
      const preferences = JSON.parse(prefs);
      document.getElementById('show-kun').checked = preferences.showKun ?? true;
      document.getElementById('show-on').checked = preferences.showOn ?? true;
      document.getElementById('show-meaning').checked = preferences.showMeaning ?? true;
      document.getElementById('show-examples').checked = preferences.showExamples ?? false;
      document.getElementById('show-stroke-order').checked = preferences.showStrokeOrder ?? false;
      document.getElementById('show-in-context').checked = preferences.showInContext ?? false;
    } else {
      // Set defaults
      document.getElementById('show-kun').checked = true;
      document.getElementById('show-on').checked = true;
      document.getElementById('show-meaning').checked = true;
      document.getElementById('show-examples').checked = false;
      document.getElementById('show-stroke-order').checked = false;
      document.getElementById('show-in-context').checked = false;
    }
  },
  
  saveTogglePreferences() {
    const preferences = {
      showKun: document.getElementById('show-kun').checked,
      showOn: document.getElementById('show-on').checked,
      showMeaning: document.getElementById('show-meaning').checked,
      showExamples: document.getElementById('show-examples').checked,
      showStrokeOrder: document.getElementById('show-stroke-order').checked,
      showInContext: document.getElementById('show-in-context').checked
    };
    localStorage.setItem('togglePreferences', JSON.stringify(preferences));
  },
  
  loadData() {
    const saved = localStorage.getItem('kanjiProgress');
    if (saved) {
      this.kanjiData = JSON.parse(saved);
    } else {
      // Initialize all kanji as unknown
      KANJI_LIST.forEach(kanji => {
        this.kanjiData[kanji] = {
          level: 0, // 0=unknown, 1=learning, 2=familiar, 3=known, 4=mastered
          lastReview: null,
          nextReview: null,
          reviewCount: 0
        };
      });
      this.saveData();
    }
  },
  
  saveData() {
    localStorage.setItem('kanjiProgress', JSON.stringify(this.kanjiData));
  },
  
  exportData() {
    const data = {
      kanjiProgress: this.kanjiData,
      togglePreferences: JSON.parse(localStorage.getItem('togglePreferences') || '{}'),
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kanji-progress-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  
  importData(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        // Validate the data structure
        if (!data.kanjiProgress) {
          alert(this.t('invalidFile'));
          return;
        }
        
        // Confirm before overwriting
        if (!confirm(this.t('importConfirm'))) {
          return;
        }
        
        // Import the data
        this.kanjiData = data.kanjiProgress;
        this.saveData();
        
        // Import preferences if they exist
        if (data.togglePreferences) {
          localStorage.setItem('togglePreferences', JSON.stringify(data.togglePreferences));
          this.loadTogglePreferences();
        }
        
        // Refresh the display
        this.renderGrid();
        this.updateStats();
        
        alert(this.t('importSuccess'));
      } catch (error) {
        alert(this.t('importError') + error.message);
      }
      
      // Reset the file input
      document.getElementById('import-file').value = '';
    };
    
    reader.readAsText(file);
  },
  
  setupEventListeners() {
    // Language button
    document.getElementById('language-btn').addEventListener('click', () => {
      this.toggleLanguage();
    });
    
    // Export/Import buttons
    document.getElementById('export-btn').addEventListener('click', () => {
      this.exportData();
    });
    
    document.getElementById('import-btn').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    
    document.getElementById('import-file').addEventListener('change', (e) => {
      this.importData(e.target.files[0]);
    });
    
    // Drag and drop
    let dragCounter = 0;
    const overlay = document.getElementById('drop-overlay');
    
    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (dragCounter === 1) {
        overlay.classList.add('active');
      }
    });
    
    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        overlay.classList.remove('active');
      }
    });
    
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      overlay.classList.remove('active');
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.type === 'application/json' || file.name.endsWith('.json')) {
          this.importData(file);
        } else {
          alert(this.t('dropJsonOnly'));
        }
      }
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        e.target.classList.add('active');
        const page = e.target.dataset.page;
        document.getElementById(page + '-page').classList.add('active');
        
        // Auto-start study when switching to study page
        if (page === 'study') {
          // Hide answer info IMMEDIATELY before startStudy runs
          document.getElementById('kanji-info').classList.remove('visible');
          document.getElementById('rating-buttons').classList.remove('visible');
          document.getElementById('show-answer-btn').style.display = 'block';
          
          // Auto-resume if there's a saved session, otherwise start fresh
          app.autoResumeOrStart();
        } else {
          // Save session when leaving study mode
          if (app.studyQueue.length > 0 && app.currentIndex < app.studyQueue.length) {
            app.saveSession();
          }
          
          // Clear study card display when leaving study mode
          document.getElementById('current-kanji').textContent = '';
          document.getElementById('context-display').textContent = '';
          document.getElementById('context-display').style.display = 'none';
          document.getElementById('session-progress').textContent = '';
        }
      });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ignore if typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      const key = e.key.toLowerCase();
      const isAnswerVisible = document.getElementById('kanji-info').classList.contains('visible');
      const isStudyMode = document.getElementById('study-page').classList.contains('active');
      
      // Only handle shortcuts in study mode
      if (!isStudyMode) return;
      
      // Space/Enter - Show Answer
      if ((key === ' ' || key === 'enter') && !isAnswerVisible) {
        e.preventDefault();
        this.showAnswer();
        return;
      }
      
      // Number keys 0-4 - Rate cards (only when answer is visible)
      if (isAnswerVisible && ['0', '1', '2', '3', '4'].includes(key)) {
        e.preventDefault();
        const rating = parseInt(key);
        this.rateCard(rating);
        return;
      }
      
      // Toggle shortcuts (work anytime in study mode)
      if (key === 'k') {
        e.preventDefault();
        document.getElementById('show-kun').click();
        return;
      }
      if (key === 'o') {
        e.preventDefault();
        document.getElementById('show-on').click();
        return;
      }
      if (key === 'm') {
        e.preventDefault();
        document.getElementById('show-meaning').click();
        return;
      }
      if (key === 'e') {
        e.preventDefault();
        document.getElementById('show-examples').click();
        return;
      }
      if (key === 's') {
        e.preventDefault();
        document.getElementById('show-stroke-order').click();
        return;
      }
      
      // Arrow keys / Backspace - Navigate cards
      if (key === 'arrowleft' || key === 'backspace') {
        e.preventDefault();
        this.previousCard();
        return;
      }
      if (key === 'arrowright') {
        e.preventDefault();
        this.nextCard();
        return;
      }
      
      // R - Restart session
      if (key === 'r') {
        e.preventDefault();
        this.startStudy();
        return;
      }
      
      // Escape - Skip card
      if (key === 'escape') {
        e.preventDefault();
        this.skipCard();
        return;
      }
    });
  },
  
  renderGrid() {
    const grid = document.getElementById('kanji-grid');
    grid.innerHTML = '';
    
    // Get current sort preference
    const sortOption = document.getElementById('grid-sort')?.value || 'default';
    
    // Create a sorted copy of KANJI_LIST
    let sortedKanji = [...KANJI_LIST];
    
    switch(sortOption) {
      case 'frequency':
        // Sort by frequency (lower number = more common)
        sortedKanji.sort((a, b) => {
          const freqA = KANJI_METADATA[a]?.frequency || 9999;
          const freqB = KANJI_METADATA[b]?.frequency || 9999;
          return freqA - freqB;
        });
        break;
        
      case 'grade':
        // Sort by grade level
        sortedKanji.sort((a, b) => {
          const gradeA = KANJI_METADATA[a]?.grade || 999;
          const gradeB = KANJI_METADATA[b]?.grade || 999;
          if (gradeA !== gradeB) return gradeA - gradeB;
          // If same grade, sort by frequency
          const freqA = KANJI_METADATA[a]?.frequency || 9999;
          const freqB = KANJI_METADATA[b]?.frequency || 9999;
          return freqA - freqB;
        });
        break;
        
      case 'jlpt':
        // Sort by JLPT level (5 = easiest, 1 = hardest)
        sortedKanji.sort((a, b) => {
          const jlptA = KANJI_METADATA[a]?.jlpt || 0;
          const jlptB = KANJI_METADATA[b]?.jlpt || 0;
          if (jlptA !== jlptB) return jlptB - jlptA; // 5 to 1
          // If same JLPT, sort by frequency
          const freqA = KANJI_METADATA[a]?.frequency || 9999;
          const freqB = KANJI_METADATA[b]?.frequency || 9999;
          return freqA - freqB;
        });
        break;
        
      case 'strokes':
        // Sort by stroke count
        sortedKanji.sort((a, b) => {
          const strokesA = KANJI_METADATA[a]?.strokes || 999;
          const strokesB = KANJI_METADATA[b]?.strokes || 999;
          if (strokesA !== strokesB) return strokesA - strokesB;
          // If same strokes, sort by frequency
          const freqA = KANJI_METADATA[a]?.frequency || 9999;
          const freqB = KANJI_METADATA[b]?.frequency || 9999;
          return freqA - freqB;
        });
        break;
        
      case 'proficiency':
        // Sort by proficiency level
        sortedKanji.sort((a, b) => {
          const levelA = this.kanjiData[a]?.level || 0;
          const levelB = this.kanjiData[b]?.level || 0;
          if (levelA !== levelB) return levelA - levelB;
          // If same level, sort by frequency
          const freqA = KANJI_METADATA[a]?.frequency || 9999;
          const freqB = KANJI_METADATA[b]?.frequency || 9999;
          return freqA - freqB;
        });
        break;
        
      case 'default':
      default:
        // Keep original order from KANJI_LIST
        break;
    }
    
    sortedKanji.forEach(kanji => {
      const cell = document.createElement('div');
      cell.className = 'kanji-cell ' + this.getLevelClass(kanji);
      cell.textContent = kanji;
      cell.title = `${this.t('clickToStudy')}: ${kanji}`;
      cell.addEventListener('click', () => this.studySpecificKanji(kanji));
      grid.appendChild(cell);
    });
  },
  
  changeGridSort() {
    const sortOption = document.getElementById('grid-sort').value;
    // Save preference
    localStorage.setItem('gridSortPreference', sortOption);
    // Re-render grid with new sort
    this.renderGrid();
  },
  
  loadGridSortPreference() {
    const saved = localStorage.getItem('gridSortPreference');
    if (saved && document.getElementById('grid-sort')) {
      document.getElementById('grid-sort').value = saved;
    }
  },
  
  toggleFilters() {
    const container = document.getElementById('study-controls-container');
    const icon = document.getElementById('toggle-filters-icon');
    const isCollapsed = container.classList.contains('collapsed');
    
    if (isCollapsed) {
      container.classList.remove('collapsed');
      icon.classList.remove('rotated');
      localStorage.setItem('filtersCollapsed', 'false');
    } else {
      container.classList.add('collapsed');
      icon.classList.add('rotated');
      localStorage.setItem('filtersCollapsed', 'true');
    }
  },
  
  toggleMobileSettings() {
    // On mobile, show filters temporarily
    const container = document.getElementById('study-controls-container');
    const toggleBtn = document.getElementById('toggle-filters-btn');
    const modeButtons = document.querySelector('#study-page .study-card > div:first-child');
    const detailedOptions = document.getElementById('detailed-options');
    const contextOption = document.querySelector('#study-page .study-options:not(#detailed-options)');
    
    // Check if currently visible
    const isVisible = container.style.display === 'grid' && !container.classList.contains('collapsed');
    
    if (isVisible) {
      // Hide everything
      container.style.display = 'none';
      container.classList.add('collapsed');
      toggleBtn.style.display = 'none';
      if (modeButtons) modeButtons.classList.remove('mobile-visible');
      if (detailedOptions) detailedOptions.classList.remove('mobile-visible');
      if (contextOption) contextOption.classList.remove('mobile-visible');
    } else {
      // Show everything
      container.style.display = 'grid';
      container.classList.remove('collapsed');
      toggleBtn.style.display = 'block';
      if (modeButtons) modeButtons.classList.add('mobile-visible');
      if (detailedOptions) detailedOptions.classList.add('mobile-visible');
      if (contextOption) contextOption.classList.add('mobile-visible');
      // Scroll to top to see filters
      setTimeout(() => window.scrollTo(0, 0), 100);
    }
  },
  
  loadFiltersState() {
    const collapsed = localStorage.getItem('filtersCollapsed');
    if (collapsed === 'true') {
      const container = document.getElementById('study-controls-container');
      const icon = document.getElementById('toggle-filters-icon');
      if (container && icon) {
        container.classList.add('collapsed');
        icon.classList.add('rotated');
      }
    }
  },
  
  loadStudyMode() {
    const saved = localStorage.getItem('studyMode');
    if (saved) {
      this.studyMode = saved;
    }
  },
  
  setStudyMode(mode) {
    this.studyMode = mode;
    localStorage.setItem('studyMode', mode);
    this.updateModeButtons();
    
    // Update display if card is showing
    if (this.currentKanji && document.getElementById('kanji-info').classList.contains('visible')) {
      this.displayAnswer();
    }
  },
  
  updateModeButtons() {
    const simpleBtn = document.getElementById('simple-mode-btn');
    const detailedBtn = document.getElementById('detailed-mode-btn');
    const detailedOptions = document.getElementById('detailed-options');
    
    if (!simpleBtn || !detailedBtn) return;
    
    if (this.studyMode === 'simple') {
      simpleBtn.classList.add('active');
      detailedBtn.classList.remove('active');
      if (detailedOptions) detailedOptions.style.display = 'none';
    } else {
      simpleBtn.classList.remove('active');
      detailedBtn.classList.add('active');
      if (detailedOptions) detailedOptions.style.display = 'block';
    }
  },
  
  studySpecificKanji(kanji) {
    // Clear saved session when manually selecting a specific kanji
    this.clearSession();
    
    // Switch to study mode tab
    this.switchTab('study');
    
    // Hide answer info IMMEDIATELY
    document.getElementById('kanji-info').classList.remove('visible');
    document.getElementById('rating-buttons').classList.remove('visible');
    document.getElementById('show-answer-btn').style.display = 'block';
    document.getElementById('kanji-reading').innerHTML = '';
    document.getElementById('kanji-meaning').textContent = '';
    document.getElementById('kanji-examples').innerHTML = '';
    
    // Create a study queue with just this kanji
    this.studyQueue = [kanji];
    this.currentIndex = 0;
    
    // Show study card
    document.getElementById('study-card').style.display = 'flex';
    document.getElementById('no-kanji').style.display = 'none';
    
    // Update progress counter
    this.updateProgressCounter();
    
    // Load the card
    this.showCard();
  },
  
  switchTab(page) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.page === page) {
        btn.classList.add('active');
      }
    });
    
    // Update pages
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
    });
    document.getElementById(page + '-page').classList.add('active');
  },
  
  getLevelClass(kanji) {
    const level = this.kanjiData[kanji]?.level || 0;
    const classes = ['unknown', 'learning', 'familiar', 'known', 'mastered'];
    return classes[level];
  },
  
  updateStats() {
    const stats = { unknown: 0, learning: 0, familiar: 0, known: 0, mastered: 0 };
    KANJI_LIST.forEach(kanji => {
      const level = this.kanjiData[kanji]?.level || 0;
      const key = ['unknown', 'learning', 'familiar', 'known', 'mastered'][level];
      stats[key]++;
    });
    
    document.getElementById('total-kanji').textContent = KANJI_LIST.length;
    document.getElementById('mastered-count').textContent = stats.mastered;
    document.getElementById('learning-count').textContent = stats.learning + stats.familiar + stats.known;
    document.getElementById('unknown-count').textContent = stats.unknown;
    
    // Update filter counts
    this.updateFilterCounts();
  },
  
  updateFilterCounts() {
    const now = new Date();
    
    // Count cards for each filter
    const counts = {
      all: KANJI_LIST.length,
      unknown: 0,
      learning: 0,
      familiar: 0,
      known: 0,
      review: 0
    };
    
    KANJI_LIST.forEach(kanji => {
      const data = this.kanjiData[kanji] || { level: 0, lastReview: null, nextReview: null, reviewCount: 0 };
      
      if (data.level === 0) counts.unknown++;
      if (data.level === 1) counts.learning++;
      if (data.level === 2) counts.familiar++;
      if (data.level === 3) counts.known++;
      
      // Count review due
      if (data.nextReview && new Date(data.nextReview) <= now) {
        counts.review++;
      }
    });
    
    // Update option text with counts using translations
    document.getElementById('filter-all').textContent = `${this.t('allLevels')} (${counts.all})`;
    document.getElementById('filter-unknown').textContent = `${this.t('unknownOnly')} (${counts.unknown})`;
    document.getElementById('filter-learning').textContent = `${this.t('learningOnly')} (${counts.learning})`;
    document.getElementById('filter-familiar').textContent = `${this.t('familiarOnly')} (${counts.familiar})`;
    document.getElementById('filter-known').textContent = `${this.t('knownOnly')} (${counts.known})`;
    document.getElementById('filter-review').textContent = `${this.t('reviewDue')} (${counts.review})`;
  },
  
  updateProgressCounter() {
    const progressElement = document.getElementById('session-progress');
    const mobileProgress = document.getElementById('mobile-nav-progress');
    if (this.studyQueue.length > 0) {
      const current = this.currentIndex + 1;
      const total = this.studyQueue.length;
      const separator = this.t('progressCounter');
      const progressText = `${current}${separator}${total}`;
      progressElement.textContent = progressText;
      if (mobileProgress) mobileProgress.textContent = progressText;
    } else {
      progressElement.textContent = '';
      if (mobileProgress) mobileProgress.textContent = '';
    }
  },
  
  async startStudy() {
    const filter = document.getElementById('level-filter').value;
    const jlptFilter = document.getElementById('jlpt-filter').value;
    const gradeFilter = document.getElementById('grade-filter').value;
    const strokeFilter = document.getElementById('stroke-filter').value;
    const sort = document.getElementById('sort-option').value;
    const limitValue = document.getElementById('study-limit').value;
    
    // Clear any saved session when starting a new one
    this.clearSession();
    
    const now = new Date();
    
    // Build queue based on filters
    this.studyQueue = KANJI_LIST.filter(kanji => {
      const data = this.kanjiData[kanji] || { level: 0, lastReview: null, nextReview: null, reviewCount: 0 };
      const metadata = KANJI_METADATA[kanji] || {};
      
      // Apply proficiency level filter
      if (filter === 'unknown' && data.level !== 0) return false;
      if (filter === 'learning' && data.level !== 1) return false;
      if (filter === 'familiar' && data.level !== 2) return false;
      if (filter === 'known' && data.level !== 3) return false;
      if (filter === 'review') {
        if (!data.nextReview) return false;
        if (new Date(data.nextReview) > now) return false;
      }
      
      // Apply JLPT filter
      if (jlptFilter !== 'all') {
        const jlptLevel = parseInt(jlptFilter);
        if (!metadata.jlpt || metadata.jlpt !== jlptLevel) return false;
      }
      
      // Apply Grade filter
      if (gradeFilter !== 'all') {
        const gradeLevel = parseInt(gradeFilter);
        if (!metadata.grade || metadata.grade !== gradeLevel) return false;
      }
      
      // Apply Stroke count filter
      if (strokeFilter !== 'all') {
        if (!metadata.strokes) return false;
        const strokes = metadata.strokes;
        
        if (strokeFilter === '1-5' && (strokes < 1 || strokes > 5)) return false;
        if (strokeFilter === '6-10' && (strokes < 6 || strokes > 10)) return false;
        if (strokeFilter === '11-15' && (strokes < 11 || strokes > 15)) return false;
        if (strokeFilter === '16-20' && (strokes < 16 || strokes > 20)) return false;
        if (strokeFilter === '21+' && strokes < 21) return false;
      }
      
      return true;
    });
    
    if (this.studyQueue.length === 0) {
      document.getElementById('study-card').style.display = 'none';
      document.getElementById('no-kanji').style.display = 'block';
      document.getElementById('session-progress').textContent = '';
      return;
    }
    
    // Sort queue
    if (sort === 'random') {
      this.studyQueue.sort(() => Math.random() - 0.5);
    } else if (sort === 'level') {
      this.studyQueue.sort((a, b) => this.kanjiData[a].level - this.kanjiData[b].level);
    } else if (sort === 'frequency') {
      // Sort by frequency from metadata
      this.studyQueue.sort((a, b) => {
        const freqA = KANJI_METADATA[a]?.frequency || 9999;
        const freqB = KANJI_METADATA[b]?.frequency || 9999;
        return freqA - freqB;
      });
    }
    
    // Apply study limit
    const limit = parseInt(limitValue);
    if (!isNaN(limit) && limit > 0) {
      this.studyQueue = this.studyQueue.slice(0, limit);
    }
    
    document.getElementById('study-card').style.display = 'flex';
    document.getElementById('no-kanji').style.display = 'none';
    
    this.currentIndex = 0;
    
    // Clear any old answer data before showing new card
    document.getElementById('kanji-info').classList.remove('visible');
    document.getElementById('rating-buttons').classList.remove('visible');
    document.getElementById('show-answer-btn').style.display = 'block';
    document.getElementById('kanji-reading').innerHTML = '';
    document.getElementById('kanji-meaning').textContent = '';
    document.getElementById('kanji-examples').innerHTML = '';
    
    // Update progress counter
    this.updateProgressCounter();
    
    this.showCard();
  },
  
  async preFetchNextCard() {
    // Pre-fetch data for the next card in background
    const nextIndex = this.currentIndex + 1;
    if (nextIndex >= this.studyQueue.length) {
      // No next card to pre-fetch
      this.nextKanjiData = null;
      return;
    }
    
    const nextKanji = this.studyQueue[nextIndex];
    console.log('Pre-fetching data for next card:', nextKanji);
    
    try {
      // Fetch from Jiten API through CORS proxy
      const jitenUrl = `https://api.jiten.moe/api/kanji/${nextKanji}`;
      const jitenResponse = await fetch(`https://corsproxy.io/?${encodeURIComponent(jitenUrl)}`);
      const jitenData = await jitenResponse.json();
      
      this.nextKanjiData = {
        kanji: nextKanji,
        data: jitenData
      };
      console.log('Pre-fetch complete for:', nextKanji);
    } catch (error) {
      console.error('Error pre-fetching next card:', error);
      this.nextKanjiData = null;
    }
  },
  
  async showCard() {
    if (this.currentIndex >= this.studyQueue.length) {
      // Session complete - clear the saved session
      this.clearSession();
      
      // Hide the card
      document.getElementById('study-card').style.display = 'none';
      document.getElementById('no-kanji').style.display = 'block';
      document.getElementById('no-kanji').innerHTML = `<p>${this.t('sessionComplete')}</p><p style="margin-top: 1rem;">${this.t('selectFilter')}</p>`;
      document.getElementById('session-progress').textContent = '';
      return;
    }
    
    // Save session after every card move
    this.saveSession();
    
    this.currentKanji = this.studyQueue[this.currentIndex];
    
    // Update progress counter
    this.updateProgressCounter();
    
    // Show loading indicator immediately
    document.getElementById('current-kanji').textContent = '...';
    document.getElementById('current-kanji').style.display = 'block';
    document.getElementById('context-display').style.display = 'none';
    
    // Check if we have pre-fetched data for this card
    if (this.nextKanjiData && this.nextKanjiData.kanji === this.currentKanji) {
      console.log('Using pre-fetched data for:', this.currentKanji);
      this.currentKanjiFullData = this.nextKanjiData.data;
      this.nextKanjiData = null; // Clear the cache
      
      // Display kanji
      document.getElementById('current-kanji').textContent = this.currentKanji;
      document.getElementById('current-kanji').style.display = 'block';
      
      // Display optional context
      this.updateContextDisplay();
    } else {
      // No cached data, fetch it now
      console.log('Fetching data for:', this.currentKanji);
      try {
        // Fetch from Jiten API through CORS proxy
        const jitenUrl = `https://api.jiten.moe/api/kanji/${this.currentKanji}`;
        const jitenResponse = await fetch(`https://corsproxy.io/?${encodeURIComponent(jitenUrl)}`);
        console.log('Jiten response status:', jitenResponse.status);
        
        if (!jitenResponse.ok) {
          throw new Error(`Jiten API returned ${jitenResponse.status}`);
        }
        
        const jitenData = await jitenResponse.json();
        console.log('Jiten data received:', jitenData);
        this.currentKanjiFullData = jitenData;
        
        // Display kanji
        document.getElementById('current-kanji').textContent = this.currentKanji;
        document.getElementById('current-kanji').style.display = 'block';
        
        // Display optional context
        this.updateContextDisplay();
        
      } catch (error) {
        console.error('Error fetching kanji data:', error);
        this.currentKanjiFullData = null;
        document.getElementById('current-kanji').textContent = this.currentKanji;
        document.getElementById('context-display').style.display = 'none';
      }
    }
    
    // Reset UI state
    document.getElementById('kanji-info').classList.remove('visible');
    document.getElementById('rating-buttons').classList.remove('visible');
    document.getElementById('show-answer-btn').style.display = 'block';
    
    // Reset display - show kanji, hide stroke order initially
    document.getElementById('current-kanji').style.display = 'block';
    document.getElementById('stroke-order').style.display = 'none';
    document.getElementById('stroke-order').innerHTML = '';
    
    // Pre-fetch the NEXT card in background
    this.preFetchNextCard();
  },
  
  displayAnswer() {
    const data = this.currentKanjiFullData;
    
    if (!data) {
      document.getElementById('kanji-reading').textContent = '—';
      document.getElementById('kanji-meaning').textContent = this.t('dataUnavailable');
      document.getElementById('kanji-examples').innerHTML = '';
      return;
    }
    
    // Simple mode: just show the most common word
    if (this.studyMode === 'simple') {
      this.displaySimpleMode(data);
      return;
    }
    
    // Detailed mode: existing behavior
    const showKun = document.getElementById('show-kun').checked;
    const showOn = document.getElementById('show-on').checked;
    const showMeaning = document.getElementById('show-meaning').checked;
    const showExamples = document.getElementById('show-examples').checked;
    const showStrokeOrder = document.getElementById('show-stroke-order').checked;
    
    // Toggle between kanji display and stroke order
    if (showStrokeOrder) {
      document.getElementById('current-kanji').style.display = 'none';
      document.getElementById('stroke-order').style.display = 'block';
      this.loadStrokeOrder();
    } else {
      document.getElementById('current-kanji').style.display = 'block';
      document.getElementById('current-kanji').textContent = this.currentKanji;
      document.getElementById('stroke-order').style.display = 'none';
    }
    
    // Context is independent - update it regardless of kanji vs stroke order
    this.updateContextDisplay();
    
    let readingHTML = '';
    
    // Show ALL kun readings if checked
    // Jiten API uses kunReadings (camelCase, not snake_case)
    if (showKun && data.kunReadings && data.kunReadings.length > 0) {
      readingHTML += `<div style="margin-bottom: 15px;">
        <strong>訓読み:</strong> ${data.kunReadings.join(', ')}
      </div>`;
    }
    
    // Show ALL on readings if checked
    // Jiten API uses onReadings (camelCase, not snake_case)
    if (showOn && data.onReadings && data.onReadings.length > 0) {
      readingHTML += `<div style="margin-bottom: 15px;">
        <strong>音読み:</strong> ${data.onReadings.join(', ')}
      </div>`;
    }
    
    if (readingHTML) {
      document.getElementById('kanji-reading').innerHTML = readingHTML;
      document.getElementById('kanji-reading').style.display = 'block';
    } else {
      document.getElementById('kanji-reading').style.display = 'none';
    }
    
    // Show ALL meanings if checked
    if (showMeaning) {
      if (data.meanings && data.meanings.length > 0) {
        document.getElementById('kanji-meaning').textContent = data.meanings.join(', ');
      } else {
        document.getElementById('kanji-meaning').textContent = '—';
      }
      document.getElementById('kanji-meaning').style.display = 'block';
    } else {
      document.getElementById('kanji-meaning').style.display = 'none';
    }
    
    // Show examples if checked
    if (showExamples) {
      const examplesHTML = this.getExamples(data);
      document.getElementById('kanji-examples').innerHTML = examplesHTML;
      document.getElementById('kanji-examples').style.display = 'block';
    } else {
      document.getElementById('kanji-examples').style.display = 'none';
    }
  },
  
  displaySimpleMode(data) {
    // Hide stroke order in simple mode
    document.getElementById('current-kanji').style.display = 'block';
    document.getElementById('current-kanji').textContent = this.currentKanji;
    document.getElementById('stroke-order').style.display = 'none';
    
    // Show context if enabled (independent of simple/detailed mode)
    this.updateContextDisplay();
    
    // Get the most common word
    if (!data.topWords || data.topWords.length === 0) {
      document.getElementById('kanji-reading').innerHTML = '<div style="color: #999;">No word data available</div>';
      document.getElementById('kanji-meaning').style.display = 'none';
      document.getElementById('kanji-examples').style.display = 'none';
      return;
    }
    
    const topWord = data.topWords[0];
    
    // Show the word with furigana
    const withFurigana = this.parseFurigana(topWord.readingFurigana || topWord.reading);
    document.getElementById('kanji-reading').innerHTML = `<div style="font-size: 32px; margin-bottom: 15px;">${withFurigana}</div>`;
    document.getElementById('kanji-reading').style.display = 'block';
    
    // Show the word's meaning
    if (topWord.mainDefinition) {
      document.getElementById('kanji-meaning').textContent = topWord.mainDefinition;
      document.getElementById('kanji-meaning').style.display = 'block';
      document.getElementById('kanji-meaning').style.fontSize = '20px';
    } else {
      document.getElementById('kanji-meaning').style.display = 'none';
    }
    
    // Hide examples in simple mode
    document.getElementById('kanji-examples').style.display = 'none';
  },
  
  async loadStrokeOrder() {
    const kanji = this.currentKanji;
    const unicode = kanji.codePointAt(0).toString(16).padStart(5, '0');
    const svgUrl = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${unicode}.svg`;
    
    try {
      const response = await fetch(svgUrl);
      const svgText = await response.text();
      
      // Parse SVG properly to avoid XML artifacts
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
      const svg = svgDoc.querySelector('svg');
      
      if (!svg) {
        throw new Error('Invalid SVG');
      }
      
      // Clean up the container and add the SVG
      const container = document.getElementById('stroke-order');
      container.innerHTML = '';
      container.appendChild(svg.cloneNode(true));
      
      // Get the imported SVG element
      const importedSvg = container.querySelector('svg');
      
      // Remove all metadata groups (kvg:element, text elements, etc.)
      importedSvg.querySelectorAll('g[id^="kvg:StrokeNumbers"]').forEach(el => el.remove());
      importedSvg.querySelectorAll('text').forEach(el => el.remove());
      
      // Get only the stroke paths (not the character outline)
      const paths = importedSvg.querySelectorAll('path[id^="kvg:"]');
      paths.forEach((path, index) => {
        // Style the strokes
        path.style.fill = 'none';
        path.style.stroke = 'black';
        path.style.strokeWidth = '3';
        path.style.strokeLinecap = 'round';
        path.style.strokeLinejoin = 'round';
        
        // Animate
        const length = path.getTotalLength();
        path.style.strokeDasharray = length;
        path.style.strokeDashoffset = length;
        path.style.animation = `drawStroke 0.5s ease-out ${index * 0.3}s forwards`;
      });
      
      // Add CSS animation if not already added
      if (!document.getElementById('stroke-animation-style')) {
        const style = document.createElement('style');
        style.id = 'stroke-animation-style';
        style.textContent = `
          @keyframes drawStroke {
            to {
              stroke-dashoffset: 0;
            }
          }
        `;
        document.head.appendChild(style);
      }
    } catch (error) {
      console.error('Error loading stroke order:', error);
      document.getElementById('stroke-order').innerHTML = `<p style="color: #999;">${this.t('strokeNotAvailable')}</p>`;
    }
  },
  
  getBestRepresentativeWord(kanji, data) {
    console.log('getBestRepresentativeWord called for:', kanji);
    
    if (!data || !data.topWords || data.topWords.length === 0) {
      console.log('No words available, returning empty array');
      return [];
    }
    
    // Jiten API returns topWords in frequency order, so just take the first 3
    const examples = [];
    
    for (let i = 0; i < Math.min(3, data.topWords.length); i++) {
      const word = data.topWords[i];
      // Use the reading field which has the kanji+kana form
      if (word.reading) {
        examples.push(word.reading);
      }
    }
    
    console.log('Top 3 frequent words:', examples);
    return examples;
  },
  
  parseFurigana(furiganaText) {
    // Parse Jiten's furigana format: "赤[あか]い" -> "<ruby>赤<rt>あか</rt></ruby>い"
    if (!furiganaText) return '';
    
    return furiganaText.replace(/([^[]+)\[([^\]]+)\]/g, '<ruby>$1<rt>$2</rt></ruby>');
  },
  
  getExamples(data) {
    if (!data.topWords || data.topWords.length === 0) {
      return `<p>${this.t('noExamples')}</p>`;
    }
    
    // Get first 5 examples from Jiten API topWords
    const examples = data.topWords.slice(0, 5);
    let html = '';
    
    examples.forEach(word => {
      // Jiten kanji endpoint structure: { reading, readingFurigana, mainDefinition }
      // Use readingFurigana for furigana display
      const withFurigana = this.parseFurigana(word.readingFurigana || word.reading);
      html += `
        <div class="example-item">
          <div class="example-ja">${withFurigana}</div>
          <div class="example-en">${word.mainDefinition || ''}</div>
        </div>
      `;
    });
    
    return html;
  },
  
  showAnswer() {
    this.displayAnswer();
    document.getElementById('kanji-info').classList.add('visible');
    document.getElementById('rating-buttons').classList.add('visible');
    document.getElementById('show-answer-btn').style.display = 'none';
  },
  
  updateContextDisplay() {
    // Update the displayed context without affecting kanji/stroke order display
    if (!this.currentKanji || !this.currentKanjiFullData) {
      return; // No card loaded yet
    }
    
    const showInContext = document.getElementById('show-in-context').checked;
    const contextDisplay = document.getElementById('context-display');
    
    if (showInContext) {
      // Show context words
      const contextWords = this.getBestRepresentativeWord(this.currentKanji, this.currentKanjiFullData);
      // Only show if we have context words
      if (contextWords.length > 0) {
        contextDisplay.textContent = contextWords.join('・'); // Japanese middle dot separator
        contextDisplay.style.display = 'block';
      } else {
        contextDisplay.style.display = 'none';
      }
    } else {
      // Hide context
      contextDisplay.style.display = 'none';
    }
  },
  
  updateDisplay() {
    // Only update if answer is already shown
    if (document.getElementById('kanji-info').classList.contains('visible')) {
      this.displayAnswer();
    }
  },
  
  rateCard(rating) {
    // Update kanji data
    const data = this.kanjiData[this.currentKanji];
    data.level = rating;
    data.lastReview = new Date().toISOString();
    data.reviewCount++;
    
    // Calculate next review (simple SRS)
    const intervals = [1, 3, 7, 14, 30]; // days
    const interval = intervals[rating] || 1;
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);
    data.nextReview = nextReview.toISOString();
    
    this.saveData();
    this.renderGrid();
    this.updateStats();
    
    // Intelligent spacing: If rated as "Again" (0) or "Learning" (1), 
    // reschedule this card to appear later in the session
    if (rating === 0 || rating === 1) {
      const currentKanji = this.currentKanji;
      
      // Calculate position to insert: put it back after a few cards (not immediately)
      // Minimum 3 cards ahead, or 1/3 through remaining cards (whichever is larger)
      const remainingCards = this.studyQueue.length - this.currentIndex - 1;
      const spacingDistance = Math.max(3, Math.floor(remainingCards / 3));
      const insertPosition = Math.min(this.currentIndex + spacingDistance, this.studyQueue.length);
      
      // Remove current card from its position
      this.studyQueue.splice(this.currentIndex, 1);
      
      // Insert it back at the calculated position
      this.studyQueue.splice(insertPosition, 0, currentKanji);
      
      // Don't increment currentIndex since we removed the current card
      // The next card will naturally move into the current position
    } else {
      // Card rated as Familiar (2), Known (3), or Mastered (4)
      // Move to next card normally
      this.currentIndex++;
    }
    
    this.showCard();
  },
  
  previousCard() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.showCard();
    }
  },
  
  nextCard() {
    if (this.currentIndex < this.studyQueue.length - 1) {
      this.currentIndex++;
      this.showCard();
    }
  },
  
  skipCard() {
    // Skip without rating
    this.currentIndex++;
    this.showCard();
  }
};

// Initialize app
app.init();
