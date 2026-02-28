// services.js

document.addEventListener("DOMContentLoaded", () => {
  loadServiceSelect();
  renderServices();
});

// Sayfadaki hizmet listesini render et
async function renderServices() {
  const serviceList = document.getElementById("dynamic-service-list");
  if (!serviceList) {
    console.log("dynamic-service-list elementi bulunamadı.");
    return;
  }

  try {
    const res = await fetch("/api/services");
    const services = await res.json();
    console.log("Gelen Hizmetler:", services);

    serviceList.innerHTML = "";

    if (services.length === 0) {
      serviceList.innerHTML = "<li>Henüz hizmet eklenmemiş.</li>";
      return;
    }

    services.forEach((service) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="service-card" data-reveal="bottom">
          <div class="card-icon">
            <img src="${service.image_path || './assets/images/message1.png'}" width="71" height="71" loading="lazy" alt="icon" onerror="this.src='./assets/images/message1.png'">
          </div>
          <h3 class="headline-sm card-title">
            <a href="#">${service.title}</a>
          </h3>
          <p class="card-text">
            ${service.dsc}
          </p>
          <button class="btn-circle" aria-label="${service.title} hakkında daha fazlasını okuyun" onclick="showServiceDetails('${service.title.replace(/'/g, "\\'")}', '${service.dsc.replace(/'/g, "\\'")}', '${service.image_path || './assets/images/message1.png'}')">
            <ion-icon name="arrow-forward" aria-hidden="true"></ion-icon>
          </button>
        </div>
      `;
      serviceList.appendChild(li);
    });

    // Scroll reveal etkisini yeni eklenen elementler için tetikle
    if (window.revealElementOnScroll) {
      window.revealElementOnScroll();
    }
  } catch (err) {
    console.error("Hizmetler render edilemedi:", err);
  }
}

// Hizmet detaylarını Terapistler kısmında göster ve oraya kaydır
function showServiceDetails(title, dsc, image_path) {
  const detailsSection = document.getElementById("service-details-section");
  if (detailsSection) {
    detailsSection.style.display = "block";
  }

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
             <a href="#appointment" class="btn btn-primary" onclick="document.getElementById('appointment') && document.getElementById('appointment').scrollIntoView({behavior: 'smooth'})">Bu Hizmet İçin Randevu Al</a>
          </div>
        </div>
      </div>
    </li>
  `;

  // Terapistler kısmına yumuşak geçişle kaydır
  therapistList.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Combobox yükleme
async function loadServiceSelect() {
  const select = document.getElementById("serviceSelect");
  if (!select) return;

  try {
    const res = await fetch("/api/services");
    const services = await res.json();

    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Hizmet seçiniz";
    select.appendChild(defaultOption);

    services.forEach((service) => {
      const option = document.createElement("option");
      option.value = service.id;
      option.textContent = service.title;
      select.appendChild(option);
    });
  } catch (err) {
    console.error(err);
  }
}
// Hizmet görseli seçildiğinde önizleme
document
  .getElementById("serviceImage")
  ?.addEventListener("change", function () {
    const file = this.files[0];
    const img = document.getElementById("service_image");

    if (file) {
      img.src = URL.createObjectURL(file);
      img.style.display = "block";
    }
  });

// Hizmet seçildiğinde formu doldur
document
  .getElementById("serviceSelect")
  ?.addEventListener("change", async function () {
    const serviceId = this.value;
    if (!serviceId) {
      clearServiceForm();
      return;
    }

    try {
      const res = await fetch(`/api/services/${serviceId}`);
      const service = await res.json();

      document.getElementById("serviceTitle").value = service.title || "";
      document.getElementById("serviceDesc").value = service.dsc || "";

      const img = document.getElementById("service_image");
      if (service.image_path) {
        img.src = service.image_path;
        img.style.display = "block";
      } else {
        img.style.display = "none";
      }
    } catch (err) {
      console.error(err);
      alert("Hizmet bilgileri yüklenemedi");
    }
  });

function clearServiceForm() {
  document.getElementById("serviceSelect").value = "";
  document.getElementById("serviceTitle").value = "";
  document.getElementById("serviceDesc").value = "";

  document.getElementById("serviceImage").value = "";

  const img = document.getElementById("service_image");
  img.src = "#";
  img.style.display = "none";
}

document.getElementById("addService")?.addEventListener("click", async () => {
  const title = document.getElementById("serviceTitle")?.value.trim();
  const dsc = document.getElementById("serviceDesc")?.value.trim();
  const file = document.getElementById("serviceImage")?.files[0];

  if (!title || !dsc) {
    alert("Başlık ve açıklama girin");
    return;
  }

  const formData = new FormData();
  formData.append("title", title);
  formData.append("dsc", dsc);
  if (file) {
    formData.append("image", file);
  }

  try {
    const res = await fetch("/api/services", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error("Ekleme başarısız");

    alert("Hizmet eklendi");
    clearServiceForm();
    loadServiceSelect();
    renderServices();
  } catch (err) {
    console.error(err);
    alert("Hizmet eklenemedi");
  }
});

document
  .getElementById("updateService")
  ?.addEventListener("click", async () => {
    const serviceId = document.getElementById("serviceSelect")?.value;
    if (!serviceId) {
      alert("Lütfen güncellenecek hizmeti seçin");
      return;
    }

    const title = document.getElementById("serviceTitle")?.value.trim();
    const dsc = document.getElementById("serviceDesc")?.value.trim();
    const file = document.getElementById("serviceImage")?.files[0];

    if (!title || !dsc) {
      alert("Başlık ve açıklama girin");
      return;
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("dsc", dsc);
    if (file) {
      formData.append("image", file);
    }

    try {
      const res = await fetch(`/api/services/${serviceId}`, {
        method: "PUT",
        body: formData,
      });

      if (!res.ok) throw new Error("Güncelleme başarısız");

      alert("Hizmet güncellendi");
      clearServiceForm();
      loadServiceSelect();
      renderServices();
    } catch (err) {
      console.error(err);
      alert("Hizmet güncellenemedi");
    }
  });

document
  .getElementById("deleteService")
  ?.addEventListener("click", async () => {
    const serviceId = document.getElementById("serviceSelect")?.value;
    if (!serviceId) {
      alert("Lütfen silinecek hizmeti seçin");
      return;
    }

    if (!confirm("Bu hizmeti silmek istediğinize emin misiniz?")) return;

    try {
      const res = await fetch(`/api/services/${serviceId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Silme başarısız");

      alert("Hizmet silindi");
      clearServiceForm();
      loadServiceSelect();
      renderServices();
    } catch (err) {
      console.error(err);
      alert("Hizmet silinemedi");
    }
  });
