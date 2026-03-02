// about.js

document.addEventListener("DOMContentLoaded", () => {
  renderAboutContent();
});

async function renderAboutContent() {
  try {
    const res = await fetch("/api/site-content");
    const data = await res.json();

    const titleEl = document.getElementById("about_title");
    const textEl = document.getElementById("about_text");
    const imageEl = document.getElementById("about_image");

    const fTitle1 = document.getElementById("feature_title1");
    const fTitle2 = document.getElementById("feature_title2");
    const fTitle3 = document.getElementById("feature_title3");

    const fDesc1 = document.getElementById("feature_desc1");
    const fDesc2 = document.getElementById("feature_desc2");
    const fDesc3 = document.getElementById("feature_desc3");

    const f1 = document.getElementById("feature1");
    const f2 = document.getElementById("feature2");
    const f3 = document.getElementById("feature3");
    const f4 = document.getElementById("feature4");

    const isHomePage = window.location.pathname.endsWith("index.html") || window.location.pathname === "/";

    // AI Auto Translate for dynamic DB content
    if (titleEl) titleEl.innerHTML = await window.i18n.t(data.about_title);
    
    if (textEl) {
      const fullText = await window.i18n.t(data.about_text);
      if (isHomePage && fullText.length > 500) {
        textEl.innerHTML = fullText.substring(0, 500) + "...";
      } else {
        textEl.innerHTML = fullText;
      }
    }

    if (imageEl && data.about_image) {
      imageEl.src = data.about_image;
    }

    if (fTitle1) fTitle1.innerHTML = await window.i18n.t(data.feature_title1);
    if (fTitle2) fTitle2.innerHTML = await window.i18n.t(data.feature_title2);
    if (fTitle3) fTitle3.innerHTML = await window.i18n.t(data.feature_title3);

    if (fDesc1) fDesc1.innerHTML = await window.i18n.t(data.feature_desc1);
    if (fDesc2) fDesc2.innerHTML = await window.i18n.t(data.feature_desc2);
    if (fDesc3) fDesc3.innerHTML = await window.i18n.t(data.feature_desc3);

    if (f1) f1.innerHTML = await window.i18n.t(data.feature1);
    if (f2) f2.innerHTML = await window.i18n.t(data.feature2);
    if (f3) f3.innerHTML = await window.i18n.t(data.feature3);
    if (f4) f4.innerHTML = await window.i18n.t(data.feature4);

    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabText = document.querySelector(".tab-text");

    if (!isHomePage && tabBtns.length > 0 && tabText) {
      tabBtns.forEach((btn, index) => {
        btn.onclick = async () => {
          tabBtns.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");

          if (index === 0) tabText.innerHTML = await window.i18n.t(data.feature_desc1);
          if (index === 1) tabText.innerHTML = await window.i18n.t(data.feature_desc2);
          if (index === 2) tabText.innerHTML = await window.i18n.t(data.feature_desc3);
        };
      });
      
      const activeBtnIndex = Array.from(tabBtns).findIndex(b => b.classList.contains('active'));
      if (activeBtnIndex !== -1) {
        const descKey = `feature_desc${activeBtnIndex + 1}`;
        tabText.innerHTML = await window.i18n.t(data[descKey]);
      }
    }

  } catch (err) {
    console.error("Hakkımızda içeriği yüklenemedi:", err);
  }
}

window.addEventListener('languageChanged', renderAboutContent);
