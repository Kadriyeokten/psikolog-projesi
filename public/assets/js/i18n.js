// public/assets/js/i18n.js

let translations = {};
let trReference = {};
let currentLang = localStorage.getItem('preferredLanguage') || 'tr';

/**
 * Load translations for the given language
 */
async function loadTranslations(lang) {
  try {
    const response = await fetch(`./assets/locales/${lang}.json?v=${Date.now()}`);
    translations = await response.json();
    
    if (Object.keys(trReference).length === 0) {
      const trRes = await fetch(`./assets/locales/tr.json?v=${Date.now()}`);
      trReference = await trRes.json();
    }

    currentLang = lang;
    document.documentElement.lang = lang;
    if (typeof window.applyTranslations === 'function') {
      window.applyTranslations();
    }
    localStorage.setItem('preferredLanguage', lang);
    updateToggleLabel(lang);
    
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang, translations } }));
  } catch (error) {
    console.error('Error loading translations:', error);
  }
}

/**
 * Apply translations to elements with data-i18n attribute (Static)
 */
window.applyTranslations = function() {
  const elements = document.querySelectorAll('[data-i18n]');
  const clinicName = window.dynamicClinicName || "Fast Terapi"; 

  elements.forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (translations[key]) {
      let translatedText = translations[key];
      
      // Dinamik yer tutucuları değiştir ({{clinic_name}})
      translatedText = translatedText.replace(/{{clinic_name}}/g, clinicName);

      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        if (element.type === 'submit' || element.type === 'button') {
          element.value = translatedText;
        } else {
          element.placeholder = translatedText;
        }
      } else {
        element.innerHTML = translatedText;
      }
    }
  });
}

function updateToggleLabel(lang) {
  const label = document.getElementById('langLabel');
  if (label) {
    label.textContent = lang.toUpperCase();
  }
}

async function switchLanguage() {
  const nextLang = currentLang === 'tr' ? 'en' : 'tr';
  await loadTranslations(nextLang);
}

/**
 * Async Translation Helper (Smart AI)
 */
async function t(input) {
  if (!input || typeof input !== 'string') return input || "";

  // 1. Her zaman önce yerel çeviri tablosuna bak (Key kontrolü)
  if (translations[input]) return translations[input];

  // 2. Eğer dil Türkçe ise ve key bulunamadıysa, input'un kendisini dön (Zaten Türkçe olduğu varsayılır)
  if (currentLang === 'tr') return input;

  // 3. Tersine arama (Reverse lookup) - DB'den gelen Türkçe metni bul
  for (let key in trReference) {
    if (trReference[key] === input) {
      return translations[key] || input;
    }
  }

  // 4. AI Otomatik Çeviri (Backend çağrısı)
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input, target: 'en' })
    });
    const data = await res.json();
    if (data.translatedText) {
      translations[input] = data.translatedText;
      return data.translatedText;
    }
  } catch (err) {
    console.error("Auto-translate failed:", err);
  }

  return input;
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  loadTranslations(currentLang);

  const toggleBtn = document.getElementById('langToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await switchLanguage();
    });
  }
});

window.i18n = {
  t: t,
  getLang: () => currentLang,
  setLang: (lang) => loadTranslations(lang)
};
