// public/assets/js/admin.js

// Yetki Kontrolü (Giriş yapılmış mı ve rol admin mi?)
const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token || role !== "admin") {
  alert("Yetkisiz erişim. Lütfen admin olarak giriş yapın.");
  window.location.href = "login.html";
}

// Özel Fetch Fonksiyonu (Tüm isteklerde token gönderir ve hataları yakalar)
async function authFetch(url, options = {}) {
  const headers = options.headers || {};
  
  // FormData kullanılıyorsa Content-Type'ı manuel olarak ayarlama (tarayıcı kendi ayarlar)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  headers['Authorization'] = `Bearer ${localStorage.getItem("token")}`;

  const config = {
    ...options,
    headers
  };

  const response = await fetch(url, config);

  if (response.status === 401 || response.status === 403) {
    alert("Oturumunuz geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.");
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "login.html";
    throw new Error("Yetkisiz erişim");
  }

  return response;
}

document.addEventListener("DOMContentLoaded", () => {
  // 1. Sidebar Navigasyonu
  const sidebarLinks = document.querySelectorAll(".admin-sidebar ul li a");
  const adminSections = document.querySelectorAll(".admin-section");

  sidebarLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const targetSectionId = link.getAttribute("data-section");
      if (!targetSectionId) return;

      e.preventDefault();
      sidebarLinks.forEach((item) => item.classList.remove("active"));
      link.classList.add("active");

      adminSections.forEach((section) => {
        section.classList.toggle("active", section.id === targetSectionId);
      });
    });
  });

  // 2. İlk Yükleme
  loadSiteContent();
  loadDoctorSelect();
  loadServiceSelect();
  loadAppointments();

  // 3. Buton Event Listenerları
  
  // Hakkımızda Kaydet
  document.getElementById("saveAboutUs")?.addEventListener("click", saveAbout);
  
  // Ayarları Kaydet (WhatsApp vb)
  document.getElementById("saveSettings")?.addEventListener("click", saveSettings);
  
  // Hizmet İşlemleri
  document.getElementById("addService")?.addEventListener("click", addService);
  document.getElementById("updateService")?.addEventListener("click", updateService);
  document.getElementById("deleteService")?.addEventListener("click", deleteService);
  
  // Doktor İşlemleri
  document.getElementById("addDoctor")?.addEventListener("click", saveDoctor);
  document.getElementById("updateDoctor")?.addEventListener("click", updateDoctor);
  document.getElementById("deleteDoctor")?.addEventListener("click", deleteDoctor);

  // Görsel Önizlemeleri
  setupImagePreview("aboutUsImage", "about_image");
  setupImagePreview("serviceImage", "service_image");
  setupImagePreview("doctorImage", "doctor_image");
});

// --- YARDIMCI FONKSİYONLAR ---

function setupImagePreview(inputId, imgId) {
  const input = document.getElementById(inputId);
  const img = document.getElementById(imgId);
  if (input && img) {
    input.addEventListener("change", function () {
      const file = this.files[0];
      if (file) {
        img.src = URL.createObjectURL(file);
        img.style.display = "block";
      }
    });
  }
}

async function loadSiteContent() {
  try {
    const res = await authFetch("/api/site-content");
    const data = await res.json();
    if (data) {
      if(document.getElementById("about_title")) document.getElementById("about_title").value = data.about_title || "";
      if(document.getElementById("about_text")) document.getElementById("about_text").value = data.about_text || "";
      if(document.getElementById("feature_title1")) document.getElementById("feature_title1").value = data.feature_title1 || "";
      if(document.getElementById("feature_title2")) document.getElementById("feature_title2").value = data.feature_title2 || "";
      if(document.getElementById("feature_title3")) document.getElementById("feature_title3").value = data.feature_title3 || "";
      if(document.getElementById("feature_desc1")) document.getElementById("feature_desc1").value = data.feature_desc1 || "";
      if(document.getElementById("feature_desc2")) document.getElementById("feature_desc2").value = data.feature_desc2 || "";
      if(document.getElementById("feature_desc3")) document.getElementById("feature_desc3").value = data.feature_desc3 || "";
      if(document.getElementById("feature1")) document.getElementById("feature1").value = data.feature1 || "";
      if(document.getElementById("feature2")) document.getElementById("feature2").value = data.feature2 || "";
      if(document.getElementById("feature3")) document.getElementById("feature3").value = data.feature3 || "";
      if(document.getElementById("feature4")) document.getElementById("feature4").value = data.feature4 || "";
      
      // WhatsApp Numarasını Yükle
      if(document.getElementById("whatsappNumber")) document.getElementById("whatsappNumber").value = data.whatsapp_number || "";
      
      const img = document.getElementById("about_image");
      if (img && data.about_image) {
        img.src = data.about_image;
        img.style.display = "block";
      }
    }
  } catch (err) { console.error("Veri çekilemedi:", err); }
}

async function saveAbout() {
  const formData = new FormData();
  formData.append("about_title", document.getElementById("about_title").value);
  formData.append("about_text", document.getElementById("about_text").value);
  formData.append("feature_title1", document.getElementById("feature_title1").value);
  formData.append("feature_title2", document.getElementById("feature_title2").value);
  formData.append("feature_title3", document.getElementById("feature_title3").value);
  formData.append("feature_desc1", document.getElementById("feature_desc1").value);
  formData.append("feature_desc2", document.getElementById("feature_desc2").value);
  formData.append("feature_desc3", document.getElementById("feature_desc3").value);
  formData.append("feature1", document.getElementById("feature1").value);
  formData.append("feature2", document.getElementById("feature2").value);
  formData.append("feature3", document.getElementById("feature3").value);
  formData.append("feature4", document.getElementById("feature4").value);
  
  // WhatsApp numarasını da about içinden (varsa) gönderelim
  const wa = document.getElementById("whatsappNumber")?.value;
  if(wa) formData.append("whatsapp_number", wa);

  const file = document.getElementById("aboutUsImage").files[0];
  if (file) formData.append("image", file);

  try {
    const res = await authFetch("/api/site-content/about", { method: "POST", body: formData });
    const data = await res.json();
    if (data.success) alert("Hakkımızda içeriği güncellendi!");
    else alert("Hata: " + data.error);
  } catch (err) { alert("Sunucu hatası!"); }
}

async function saveSettings() {
  const whatsapp_number = document.getElementById("whatsappNumber").value;
  try {
    const res = await authFetch("/api/site-content/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsapp_number })
    });
    const data = await res.json();
    if (data.success) {
      alert("Ayarlar kaydedildi!");
    } else {
      alert("Hata: " + (data.detail || "Bilinmeyen bir hata oluştu."));
    }
  } catch (err) { 
    console.error(err); 
    alert("Sunucuyla bağlantı kurulamadı!"); 
  }
}

// --- HİZMET YÖNETİMİ ---

async function loadServiceSelect() {
  const select = document.getElementById("serviceSelect");
  if (!select) return;
  try {
    const res = await authFetch("/api/services");
    const services = await res.json();
    select.innerHTML = '<option value="">Yeni Hizmet Ekle</option>';
    services.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.title;
      select.appendChild(opt);
    });
  } catch (err) { console.error(err); }
}

document.getElementById("serviceSelect")?.addEventListener("change", async function() {
  const id = this.value;
  if (!id) { clearServiceForm(); return; }
  try {
    const res = await authFetch(`/api/services/${id}`);
    const s = await res.json();
    document.getElementById("serviceTitle").value = s.title;
    document.getElementById("serviceDesc").value = s.dsc;
    const img = document.getElementById("service_image");
    if (s.image_path) { img.src = s.image_path; img.style.display = "block"; }
    else img.style.display = "none";
  } catch (err) { console.error(err); }
});

async function addService() {
  const title = document.getElementById("serviceTitle").value;
  const dsc = document.getElementById("serviceDesc").value;
  const file = document.getElementById("serviceImage").files[0];
  if (!title || !dsc) return alert("Başlık ve açıklama girin!");

  const formData = new FormData();
  formData.append("title", title);
  formData.append("dsc", dsc);
  if (file) formData.append("image", file);

  try {
    const res = await authFetch("/api/services", { method: "POST", body: formData });
    if (res.ok) { 
      // Trigger auto-translation
      await authFetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: title, target: 'en'}) });
      await authFetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: dsc, target: 'en'}) });
      
      alert("Hizmet eklendi!"); 
      clearServiceForm(); 
      loadServiceSelect(); 
    }
  } catch (err) { alert("Ekleme hatası!"); }
}

async function updateService() {
  const id = document.getElementById("serviceSelect").value;
  if (!id) return alert("Lütfen bir hizmet seçin!");
  const title = document.getElementById("serviceTitle").value;
  const dsc = document.getElementById("serviceDesc").value;
  const file = document.getElementById("serviceImage").files[0];

  const formData = new FormData();
  formData.append("title", title);
  formData.append("dsc", dsc);
  if (file) formData.append("image", file);

  try {
    const res = await authFetch(`/api/services/${id}`, { method: "PUT", body: formData });
    if (res.ok) { 
      // Trigger auto-translation
      await authFetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: title, target: 'en'}) });
      await authFetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: dsc, target: 'en'}) });

      alert("Hizmet güncellendi!"); 
      loadServiceSelect(); 
    }
  } catch (err) { alert("Güncelleme hatası!"); }
}

async function deleteService() {
  const id = document.getElementById("serviceSelect").value;
  if (!id || !confirm("Emin misiniz?")) return;
  try {
    const res = await authFetch(`/api/services/${id}`, { method: "DELETE" });
    if (res.ok) { alert("Silindi!"); clearServiceForm(); loadServiceSelect(); }
  } catch (err) { alert("Silme hatası!"); }
}

function clearServiceForm() {
  document.getElementById("serviceTitle").value = "";
  document.getElementById("serviceDesc").value = "";
  document.getElementById("service_image").style.display = "none";
  document.getElementById("serviceImage").value = "";
}

// --- DOKTOR YÖNETİMİ ---

async function loadDoctorSelect() {
  const select = document.getElementById("doctorSelect");
  if (!select) return;
  try {
    const res = await authFetch("/api/doctors");
    const doctors = await res.json();
    select.innerHTML = '<option value="">Doktor Seçiniz</option>';
    doctors.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.full_name;
      select.appendChild(opt);
    });
  } catch (err) { console.error(err); }
}

document.getElementById("doctorSelect")?.addEventListener("change", async function() {
  const id = this.value;
  if (!id) { clearDoctorForm(); return; }
  try {
    const res = await authFetch(`/api/doctors/${id}`);
    const d = await res.json();
    document.getElementById("doctorName").value = d.full_name;
    document.getElementById("doctorTitle").value = d.title;
    document.getElementById("doctorPhone").value = d.phone;
    document.getElementById("doctorEmail").value = d.email;
    document.getElementById("doctorInstagram").value = d.instagram || "";
    document.getElementById("doctorTwitter").value = d.twitter || "";
    document.getElementById("doctorFacebook").value = d.facebook || "";
    document.getElementById("doctorLinkedin").value = d.linkedin || "";
    document.getElementById("doctorBio").value = d.bio || "";
    document.getElementById("doctorIsActive").checked = d.is_active;
    
    const img = document.getElementById("doctor_image");
    if (d.image_path) { img.src = d.image_path; img.style.display = "block"; }
    else img.style.display = "none";
  } catch (err) { console.error(err); }
});

async function saveDoctor() {
  const formData = getDoctorFormData();
  try {
    const res = await authFetch("/api/doctors", { method: "POST", body: formData });
    if (res.ok) { 
      // Trigger auto-translation for bio and title
      const bio = document.getElementById("doctorBio").value;
      const title = document.getElementById("doctorTitle").value;
      if(bio) await authFetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: bio, target: 'en'}) });
      if(title) await authFetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: title, target: 'en'}) });
      
      alert("Doktor başarıyla eklendi!"); 
      loadDoctorSelect(); 
      clearDoctorForm(); 
    } else {
      alert("Doktor eklenemedi.");
    }
  } catch (err) { alert("Sunucu hatası!"); }
}

async function updateDoctor() {
  const id = document.getElementById("doctorSelect").value;
  if (!id) return alert("Lütfen güncellenecek doktoru seçin!");
  const formData = getDoctorFormData();
  try {
    const res = await authFetch(`/api/doctors/${id}`, { method: "PUT", body: formData });
    if (res.ok) { 
      // Trigger auto-translation updates
      const bio = document.getElementById("doctorBio").value;
      const title = document.getElementById("doctorTitle").value;
      if(bio) await authFetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: bio, target: 'en'}) });
      if(title) await authFetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: title, target: 'en'}) });

      alert("Doktor bilgileri güncellendi!"); 
      loadDoctorSelect(); 
    } else {
      alert("Güncelleme başarısız.");
    }
  } catch (err) { alert("Sunucu hatası!"); }
}

async function deleteDoctor() {
  const id = document.getElementById("doctorSelect").value;
  if (!id) return alert("Lütfen silinecek doktoru seçin!");
  if (!confirm("Bu doktoru silmek istediğinize emin misiniz?")) return;
  try {
    const res = await authFetch(`/api/doctors/${id}`, { method: "DELETE" });
    if (res.ok) { 
      alert("Doktor silindi!"); 
      clearDoctorForm();
      loadDoctorSelect(); 
    } else {
      alert("Silme işlemi başarısız.");
    }
  } catch (err) { alert("Sunucu hatası!"); }
}

function getDoctorFormData() {
  const formData = new FormData();
  formData.append("full_name", document.getElementById("doctorName").value);
  formData.append("title", document.getElementById("doctorTitle").value);
  formData.append("phone", document.getElementById("doctorPhone").value);
  formData.append("email", document.getElementById("doctorEmail").value);
  formData.append("instagram", document.getElementById("doctorInstagram").value);
  formData.append("twitter", document.getElementById("doctorTwitter").value);
  formData.append("facebook", document.getElementById("doctorFacebook").value);
  formData.append("linkedin", document.getElementById("doctorLinkedin").value);
  formData.append("is_active", document.getElementById("doctorIsActive").checked);
  formData.append("bio", document.getElementById("doctorBio").value);
  const file = document.getElementById("doctorImage").files[0];
  if (file) formData.append("image", file);
  return formData;
}

function clearDoctorForm() {
  if(document.getElementById("doctorSelect")) document.getElementById("doctorSelect").value = "";
  if(document.getElementById("doctorName")) document.getElementById("doctorName").value = "";
  if(document.getElementById("doctorTitle")) document.getElementById("doctorTitle").value = "";
  if(document.getElementById("doctorPhone")) document.getElementById("doctorPhone").value = "";
  if(document.getElementById("doctorEmail")) document.getElementById("doctorEmail").value = "";
  if(document.getElementById("doctorInstagram")) document.getElementById("doctorInstagram").value = "";
  if(document.getElementById("doctorTwitter")) document.getElementById("doctorTwitter").value = "";
  if(document.getElementById("doctorFacebook")) document.getElementById("doctorFacebook").value = "";
  if(document.getElementById("doctorLinkedin")) document.getElementById("doctorLinkedin").value = "";
  if(document.getElementById("doctorBio")) document.getElementById("doctorBio").value = "";
  if(document.getElementById("doctorIsActive")) document.getElementById("doctorIsActive").checked = false;
  
  const img = document.getElementById("doctor_image");
  if (img) {
    img.src = "#";
    img.style.display = "none";
  }
  if(document.getElementById("doctorImage")) document.getElementById("doctorImage").value = "";
}

// --- RANDEVU YÖNETİMİ ---

let allAppointments = [];

async function loadAppointments() {
  const tbody = document.getElementById('appointmentsTableBody');
  if (!tbody) return;
  try {
    const res = await authFetch('/api/appointments');
    allAppointments = await res.json();
    renderAppointmentsTable(allAppointments);
  } catch (err) { 
    console.error(err); 
    tbody.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: red;">Veriler yüklenemedi.</td></tr>';
  }
}

function renderAppointmentsTable(apps) {
  const tbody = document.getElementById('appointmentsTableBody');
  if (!tbody) return;
  
  if (apps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding: 40px; text-align: center; color: #888; font-size: 1.4rem;">Randevu bulunamadı.</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  apps.forEach(app => {
    const dateObj = new Date(app.appointment_date);
    const now = new Date();
    const isPast = dateObj < now;

    const dateStr = dateObj.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
    const timeStr = dateObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    
    // Status Badge Logic
    let statusText = app.status || 'Bekliyor';
    let statusColor = "#856404";
    let statusBg = "#fff3cd";

    if (isPast && statusText === 'Bekliyor') {
      statusText = "Süresi Geçti";
      statusColor = "#495057";
      statusBg = "#e9ecef";
    } else if (statusText === "Tamamlandı") { 
      statusColor = "#155724"; 
      statusBg = "#d4edda"; 
    } else if (statusText === "İptal Edildi") { 
      statusColor = "#721c24"; 
      statusBg = "#f8d7da"; 
    }

    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #eee';
    tr.style.transition = "background 0.2s";
    tr.onmouseover = () => tr.style.background = "#fafafa";
    tr.onmouseout = () => tr.style.background = "transparent";

    tr.innerHTML = `
      <td style="padding: 15px; font-size: 1.4rem;">
        <div style="font-weight: 600; color: ${isPast ? '#999' : 'var(--midnight-green)'};">${dateStr}</div>
        <div style="color: #888; font-size: 1.2rem;">${timeStr}</div>
      </td>
      <td style="padding: 15px; font-size: 1.4rem;">
        <div style="font-weight: 600;">${app.patient_name}</div>
        <div style="color: #666; font-size: 1.2rem;">
            <a href="tel:${app.patient_phone}" style="color: inherit; text-decoration: none;"><ion-icon name="call-outline" style="vertical-align: middle;"></ion-icon> ${app.patient_phone}</a>
        </div>
      </td>
      <td style="padding: 15px; font-size: 1.4rem; color: #444;">${app.service_name || '-'}</td>
      <td style="padding: 15px; font-size: 1.4rem; color: #444;">${app.doctor_name || '-'}</td>
      <td style="padding: 15px; text-align: center;">
        <span style="padding: 6px 12px; border-radius: 20px; font-size: 1.2rem; font-weight: 500; background: ${statusBg}; color: ${statusColor}; border: 1px solid rgba(0,0,0,0.05);">
          ${statusText}
        </span>
      </td>
      <td style="padding: 15px; text-align: right; white-space: nowrap;">
        ${app.status === 'Bekliyor' ? `
          <button onclick="updateAppointmentStatus(${app.id}, 'Tamamlandı')" 
                  style="background: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size: 1.2rem; font-weight: 500; display: inline-flex; align-items: center; gap: 5px; margin-right: 5px;" title="Tamamlandı olarak işaretle">
            <ion-icon name="checkmark-circle-outline"></ion-icon>
            <span>Tamamlandı</span>
          </button>
          <button onclick="updateAppointmentStatus(${app.id}, 'İptal Edildi')" 
                  style="background: #ffc107; color: #212529; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size: 1.2rem; font-weight: 500; display: inline-flex; align-items: center; gap: 5px; margin-right: 5px;" title="İptal Et">
            <ion-icon name="close-circle-outline"></ion-icon>
            <span>İptal</span>
          </button>
        ` : ''}
        <button class="btn-delete" onclick="deleteAppointment(${app.id})" 
                style="background: #dc3545; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size: 1.2rem; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;" title="Sil">
          <ion-icon name="trash-outline"></ion-icon>
          <span>Sil</span>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function updateAppointmentStatus(id, status) {
  if (!confirm(`Randevu durumunu "${status}" olarak güncellemek istediğinize emin misiniz?`)) return;
  try {
    const res = await authFetch(`/api/appointments/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      alert("Randevu durumu güncellendi.");
      loadAppointments();
    } else {
      alert("Güncelleme başarısız.");
    }
  } catch (err) {
    console.error(err);
    alert("Sunucu hatası!");
  }
}

// Arama Filtresi
document.getElementById("appointmentSearch")?.addEventListener("input", (e) => {
  const term = e.target.value.toLowerCase();
  const filtered = allAppointments.filter(app => 
    app.patient_name.toLowerCase().includes(term) || 
    (app.service_name && app.service_name.toLowerCase().includes(term)) ||
    app.patient_phone.includes(term)
  );
  renderAppointmentsTable(filtered);
});

async function deleteAppointment(id) {
  if (!confirm("Silinsin mi?")) return;
  try {
    const res = await authFetch(`/api/appointments/${id}`, { method: 'DELETE' });
    if (res.ok) { alert("Silindi."); loadAppointments(); }
  } catch (err) { console.error(err); }
}
