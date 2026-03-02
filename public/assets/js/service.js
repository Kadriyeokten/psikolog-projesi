// services.js

document.addEventListener("DOMContentLoaded", () => {
  loadServiceSelect();
  renderServices();
});

// Sayfadaki hizmet listesini render et
async function renderServices() {
  const serviceList = document.getElementById("dynamic-service-list");
  if (!serviceList) return;

  try {
    const res = await fetch("/api/services");
    const services = await res.json();

    serviceList.innerHTML = "";

    if (services.length === 0) {
      serviceList.innerHTML = `<li>${await window.i18n.t("loading")}</li>`;
      return;
    }

    for (const service of services) {
      const title = await window.i18n.t(service.title);
      const fullDsc = await window.i18n.t(service.dsc);
      const shortDsc = fullDsc.length > 100 ? fullDsc.substring(0, 100) + "..." : fullDsc;
      
      const safeTitle = title.replace(/"/g, '&quot;');
      const safeImg = (service.image_path || './assets/images/message1.png').replace(/"/g, '&quot;');
      const safeDsc = fullDsc.replace(/"/g, '&quot;');
      
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="service-card" data-reveal="bottom">
          <div class="card-icon">
            <img src="${safeImg}" width="71" height="71" loading="lazy" alt="icon" onerror="this.src='./assets/images/message1.png'">
          </div>
          <h3 class="headline-sm card-title">
            <a href="#">${safeTitle}</a>
          </h3>
          <p class="card-text">
            ${shortDsc}
          </p>
          <button class="btn-circle detail-btn" aria-label="${safeTitle}" data-title="${safeTitle}" data-dsc="${safeDsc}" data-img="${safeImg}">
            <ion-icon name="arrow-forward" aria-hidden="true"></ion-icon>
          </button>
        </div>
      `;
      serviceList.appendChild(li);
    }

    const detailButtons = document.querySelectorAll(".detail-btn");
    detailButtons.forEach(btn => {
      btn.onclick = function() {
        const title = this.getAttribute("data-title");
        const dsc = this.getAttribute("data-dsc").replace(/\n/g, '<br>');
        const img = this.getAttribute("data-img");
        showServiceDetails(title, dsc, img);
      };
    });

    if (window.revealElementOnScroll) window.revealElementOnScroll();
  } catch (err) {
    console.error("Hizmetler render edilemedi:", err);
  }
}

async function showServiceDetails(title, dsc, image_path) {
  const detailsSection = document.getElementById("service-details-section");
  if (detailsSection) detailsSection.style.display = "block";

  const therapistList = document.getElementById("therapist-list");
  if (!therapistList) return;

  therapistList.innerHTML = `
    <li style="width: 100%; grid-column: 1 / -1;">
      <div class="listing-card" style="display: flex; flex-direction: column; gap: 20px; align-items: center; text-align: center; padding: 40px; background: var(--white); border-radius: var(--radius-12); box-shadow: var(--shadow-1);">
        <div class="card-icon" style="width: 120px; height: 120px; border-radius: 50%; overflow: hidden; display: flex; justify-content: center; align-items: center; background: var(--alice-blue); margin-bottom: 20px;">
          <img src="${image_path}" style="max-width: 100%; max-height: 100%;" loading="lazy" alt="${title}" onerror="this.src='./assets/images/message1.png'">
        </div>
        <div>
          <h3 class="headline-sm card-title" style="color: var(--midnight-green); margin-bottom: 15px;">${title}</h3>
          <p class="card-text" style="font-size: 1.4rem; line-height: 1.8; color: var(--gray-web); max-width: 800px;">
            ${dsc}
          </p>
          <div style="margin-top: 30px;">
             <a href="appointment.html" class="btn btn-primary">${await window.i18n.t("nav_appointment")}</a>
          </div>
        </div>
      </div>
    </li>
  `;

  therapistList.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadServiceSelect() {
  const select = document.getElementById("serviceSelect");
  if (!select) return;

  try {
    const res = await fetch("/api/services");
    const services = await res.json();

    select.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = await window.i18n.t("select_service");
    select.appendChild(defaultOption);

    for (const service of services) {
      const option = document.createElement("option");
      option.value = service.id;
      option.textContent = await window.i18n.t(service.title);
      select.appendChild(option);
    }
  } catch (err) {
    console.error(err);
  }
}

window.addEventListener('languageChanged', () => {
  renderServices();
  loadServiceSelect();
});
