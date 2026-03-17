document.addEventListener("DOMContentLoaded", async function () {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const profileForm = document.getElementById("profileForm");
  const appointmentsList = document.getElementById("appointmentsList");

  // Fetch and display profile info
  async function fetchProfile() {
    try {
      const response = await fetch("/api/user/me", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        const user = await response.json();
        document.getElementById("name").value = user.name || "";
        document.getElementById("surname").value = user.surname || "";
        document.getElementById("email").value = user.email || "";
        document.getElementById("phone").value = user.phone || "";
      } else if (response.status === 403) {
        // Token expired or invalid
        localStorage.clear();
        window.location.href = "login.html";
      }
    } catch (err) {
      console.error("Profile fetch error:", err);
    }
  }

  // Fetch and display appointment history
  async function fetchAppointments() {
    try {
      const response = await fetch("/api/user/appointments", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        const appointments = await response.json();
        if (appointments.length === 0) {
          appointmentsList.innerHTML = "<p>Henüz randevunuz bulunmamaktadır.</p>";
          return;
        }

        let html = `
          <table class="appointment-table">
            <thead>
              <tr>
                <th>Hizmet</th>
                <th>Doktor</th>
                <th>Tarih</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
        `;

        appointments.forEach(app => {
          const date = new Date(app.appointment_date).toLocaleString('tr-TR');
          let statusClass = "status-pending";
          if (app.status === "Tamamlandı") statusClass = "status-completed";
          if (app.status === "İptal Edildi") statusClass = "status-cancelled";

          html += `
            <tr>
              <td>${app.service_name || '-'}</td>
              <td>${app.doctor_name || '-'}</td>
              <td>${date}</td>
              <td><span class="status-badge ${statusClass}">${app.status}</span></td>
            </tr>
          `;
        });

        html += "</tbody></table>";
        appointmentsList.innerHTML = html;
      }
    } catch (err) {
      console.error("Appointments fetch error:", err);
      appointmentsList.innerHTML = "<p>Randevular yüklenirken bir hata oluştu.</p>";
    }
  }

  // Handle profile update
  profileForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const updatedData = {
      name: document.getElementById("name").value,
      surname: document.getElementById("surname").value,
      email: document.getElementById("email").value,
      phone: document.getElementById("phone").value
    };

    try {
      const response = await fetch("/api/user/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(updatedData)
      });

      const result = await response.json();
      if (response.ok) {
        alert("Profil başarıyla güncellendi.");
        // Update local name if changed
        localStorage.setItem("name", updatedData.name);
      } else {
        alert(result.error || "Güncelleme sırasında bir hata oluştu.");
      }
    } catch (err) {
      console.error("Profile update error:", err);
      alert("Bir hata oluştu.");
    }
  });

  fetchProfile();
  fetchAppointments();
});
