// services.js

document.addEventListener("DOMContentLoaded", () => {
  loadServiceSelect();
});

// Combobox yükleme
async function loadServiceSelect() {
  try {
    const res = await fetch("/api/services");
    const services = await res.json();

    const select = document.getElementById("serviceSelect");
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
    alert("Hizmetler yüklenemedi");
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
  const image_path = document.getElementById("serviceImage")?.value.trim();

  if (!title || !dsc) {
    alert("Başlık ve açıklama girin");
    return;
  }

  try {
    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dsc, image_path }),
    });

    if (!res.ok) throw new Error("Ekleme başarısız");

    alert("Hizmet eklendi");
    clearServiceForm();
    loadServiceSelect();
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
    const image_path = document.getElementById("serviceImage")?.value.trim();

    if (!title || !dsc) {
      alert("Başlık ve açıklama girin");
      return;
    }

    try {
      const res = await fetch(`/api/services/${serviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, dsc, image_path }),
      });

      if (!res.ok) throw new Error("Güncelleme başarısız");

      alert("Hizmet güncellendi");
      clearServiceForm();
      loadServiceSelect();
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
    } catch (err) {
      console.error(err);
      alert("Hizmet silinemedi");
    }
  });
