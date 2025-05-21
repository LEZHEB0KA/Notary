// Для разработки в WebStorm:
const API_BASE_URL = 'http://localhost:3001';

// Добавьте глобальную обработку ошибок fetch:
async function safeFetch(url, options) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Fetch error:', error);
        return { error: error.message };
    }
}

// Глобальные функции для работы с API
async function getOrders() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.error('Токен отсутствует');
        return { error: 'Требуется авторизация' };
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/orders`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error || 'Ошибка сервера');
        }

        return await response.json();
    } catch (error) {
        console.error('Ошибка в getOrders:', error);
        return { error: error.message };
    }
}

async function createServiceDocument(documentData) {
    const token = localStorage.getItem('token');
    if (!token) {
        return { error: 'Требуется авторизация' };
    }

    try {
        console.log('Отправка данных для создания документа:', documentData);

        const response = await fetch(`${API_BASE_URL}/api/service-documents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(documentData)
        });

        // Проверка content-type
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Сервер вернул не JSON:', text);
            throw new Error('Ожидался JSON, но получен: ' + text.substring(0, 100));
        }

        const result = await response.json();

        if (!response.ok) {
            console.error('Ошибка создания документа:', result);
            throw new Error(result.error || 'Ошибка при создании документа');
        }

        console.log('Документ успешно создан:', result);
        return result;
    } catch (error) {
        console.error('Ошибка в createServiceDocument:', error);
        return { error: error.message };
    }
}

async function getClientDocuments() {
    const token = localStorage.getItem('token');
    try {
        const response = await fetch(`${API_BASE_URL}/api/client/documents`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка при получении документов');
        }

        return await response.json();
    } catch (error) {
        console.error('Ошибка:', error);
        return { error: error.message };
    }
}

async function renderClientDocuments() {
    try {
        const documents = await getClientDocuments();
        if (documents.error) throw new Error(documents.error);

        const container = document.getElementById('client-documents-container');
        if (!container) return;

        container.innerHTML = documents.map(doc => `
            <div class="document-item">
                <h3>Документ № ${doc.document_number}</h3>
                <p><strong>Дата:</strong> ${new Date(doc.service_date).toLocaleString()}</p>
                <p><strong>Сотрудник:</strong> ${doc.employee_name}</p>
                <p><strong>Сумма:</strong> ${parseFloat(doc.total_amount).toLocaleString()} ₽</p>
                <p><strong>Ответ:</strong> ${doc.response_text}</p>
                <div class="services-details">
                    <h4>Оказанные услуги:</h4>
                    ${JSON.parse(doc.services).map(s => `
                        <p>${s.name} (${s.quantity} × ${s.price} ₽)</p>
                    `).join('')}
                </div>
            </div>
        `).join('') || '<p>Нет документов</p>';
    } catch (error) {
        console.error('Ошибка при загрузке документов:', error);
    }
}

function checkAuthStatus() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const user = JSON.parse(atob(token.split('.')[1]));

            if (user.role === 'client') {
                document.getElementById('client-login').textContent = 'Личный кабинет';
                renderClientDocuments();
            } else if (user.role === 'employee' || user.role === 'admin') {
                document.getElementById('employee-login').textContent = user.role === 'admin' ? 'Панель администратора' : 'Панель сотрудника';
                document.getElementById('create-service-btn').style.display = 'block';
                document.getElementById('employee-requests').style.display = 'block';

                if (user.role === 'admin') {
                    document.getElementById('admin-settings').style.display = 'block';
                }
            }
        } catch (e) {
            console.error('Ошибка при разборе токена:', e);
        }
    }
}

async function renderClientsList() {
    const clients = await getClients();
    if (clients.error) {
        document.getElementById('clients-list').innerHTML = `<p>${clients.error}</p>`;
        return;
    }
    document.getElementById('clients-list').innerHTML = clients.map(client => `
        <div class="data-item">
            <p><strong>${client.name}</strong> (${client.email})</p>
            <p>Phone: ${client.phone}, Address: ${client.address}</p>
        </div>
    `).join('');
}

async function getApplications() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/api/applications`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        return {error: 'Ошибка при получении заявок'};
    }

    return await response.json();
}

async function renderApplicationsList() {
    try {
        const applications = await getApplications();
        if (applications.error) {
            console.error('Ошибка при получении заявок:', applications.error);
            document.getElementById('applications-list').innerHTML = `<p>${applications.error}</p>`;
            return;
        }

        if (!applications || applications.length === 0) {
            document.getElementById('applications-list').innerHTML = '<p>Нет заявок на работу</p>';
            return;
        }

        document.getElementById('applications-list').innerHTML = applications.map(app => `
            <div class="data-item">
                <p><strong>ID: ${app.id}</strong> | ${app.name} (Опыт: ${app.experience} лет)</p>
                <p>Телефон: ${app.phone}, Адрес: ${app.address}</p>
                ${app.photo_url ? `<p>Фото: <img src="${API_BASE_URL}/uploads/${app.photo_url}" alt="Фото кандидата" width="100" onerror="this.style.display='none'"></p>` : ''}
                <p>Дата заявки: ${new Date(app.application_date).toLocaleDateString()}</p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка при загрузке заявок:', error);
        document.getElementById('applications-list').innerHTML = `<p>Ошибка: ${error.message}</p>`;
    }
}

async function renderEmployeesList() {
    try {
        const employees = await getEmployees();
        if (employees.error) {
            console.error('Ошибка при получении сотрудников:', employees.error);
            document.getElementById('employees-list').innerHTML = `<p>${employees.error}</p>`;
            return;
        }

        if (!employees || employees.length === 0) {
            document.getElementById('employees-list').innerHTML = '<p>Нет данных о сотрудниках</p>';
            return;
        }

        document.getElementById('employees-list').innerHTML = employees.map(emp => `
            <div class="data-item">
                <p><strong>ID: ${emp.id}</strong> | ${emp.name} (${emp.position})</p>
                ${emp.photo_url ? `<p>Фото: <img src="${API_BASE_URL}/uploads/${emp.photo_url}" alt="Фото сотрудника" width="100"></p>` : ''}
                <p>Email: ${emp.email}, Телефон: ${emp.phone}</p>
                <p>Адрес: ${emp.address}, Опыт: ${emp.experience} лет</p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка при загрузке сотрудников:', error);
        document.getElementById('employees-list').innerHTML = `<p>Ошибка: ${error.message}</p>`;
    }
}

async function renderAdminPanel() {
    try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Необходима авторизация');

        const user = JSON.parse(atob(token.split('.')[1]));
        if (user.role !== 'admin') throw new Error('Недостаточно прав');

        await renderClientsList();
        await renderApplicationsList();
        await renderEmployeesList();
    } catch (error) {
        console.error('Ошибка при загрузке панели администратора:', error);
        alert(error.message);
    }
}

async function getClients() {
    const token = localStorage.getItem('token');
    try {
        const response = await fetch(`${API_BASE_URL}/api/clients`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 403) {
            return { error: 'Доступ запрещен. Недостаточно прав.' };
        }

        if (!response.ok) {
            const error = await response.json();
            return { error: error.error || 'Ошибка при получении клиентов' };
        }

        return await response.json();
    } catch (error) {
        console.error('Ошибка:', error);
        return { error: error.message };
    }
}

async function getEmployees() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/api/employees`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        return {error: 'Ошибка при получении сотрудников'};
    }

    return await response.json();
}

function authenticateToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    console.log('Токен:', token); // Логируем токен

    if (!token) {
        console.log('Токен отсутствует');
        return res.status(401).json({ error: 'Требуется авторизация' }); // Всегда JSON!
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.log('Неверный токен:', err.message);
            return res.status(403).json({ error: 'Неверный токен' });
        }
        req.user = user;
        next();
    });
}

async function performSearch(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/search?query=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error('Ошибка при выполнении поиска');
        }
        return await response.json();
    } catch (error) {
        console.error('Search error:', error);
        return { error: error.message };
    }
}

// Функция для отображения результатов поиска
function displaySearchResults(results) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Результаты поиска</h2>
            <div class="search-results">
                ${renderResultsSection('Услуги', results.services)}
                ${renderResultsSection('Клиенты', results.clients)}
                ${renderResultsSection('Сотрудники', results.employees)}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Обработчик закрытия модального окна
    modal.querySelector('.close').addEventListener('click', function() {
        modal.style.display = 'none';
        document.body.removeChild(modal);
    });

    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.style.display = 'none';
            document.body.removeChild(this);
        }
    });
}

function renderResultsSection(title, items) {
    if (!items || items.length === 0) return '';

    return `
        <div class="search-section">
            <h3>${title}</h3>
            <ul>
                ${items.map(item => `
                    <li>
                        <strong>${item.title}</strong>
                        ${item.price ? ` - ${item.price} ₽` : ''}
                        ${item.position ? ` (${item.position})` : ''}
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', function() {
    // Состояние приложения
    const clientsDB = [];
    const employeesDB = [];
    const applicationsDB = [];
    let selectedServices = [];
    let isNewClient = true;
    let isAdmin = false;
    let currentUser = null;

    // Инициализация интерфейса
    initServices();
    setupEventListeners();
    checkAuthStatus();

    function initServices() {
        const services = document.querySelectorAll('.services-list li');
        services.forEach(service => {
            service.addEventListener('click', function() {
                const serviceName = this.querySelector('.service-name').textContent;
                const servicePrice = parseInt(this.querySelector('.service-price').textContent.replace(/\D/g, ''));
                addService(serviceName, servicePrice);
                updateTotal(); // Добавлен вызов
            });
        });
    }

    function removeService(serviceId) {
        selectedServices = selectedServices.filter(service => service.id !== serviceId);
        renderSelectedServices();
        updateTotal(); // Добавлен вызов
    }

    function updateTotal() {
        let total = selectedServices.reduce((sum, service) => sum + (service.price * service.quantity), 0);
        let discountInfo = 'Доступные скидки будут рассчитаны автоматически';
        let discount = 0;

        // Применяем скидки
        if (total >= 10000) {
            discount += 0.2; // 20% скидка
            discountInfo = 'Объемная скидка 20%';
        }
        if (isNewClient) {
            discount += 0.1; // 10% скидка
            discountInfo += discountInfo ? ' + скидка для нового клиента 10%' : 'Скидка для нового клиента 10%';
        }

        if (discount > 0) {
            total *= (1 - discount);
            discountInfo += ` применена (итого ${discount * 100}% скидки)`;
        }

        document.getElementById('total-amount').textContent = total.toLocaleString();
        document.getElementById('discount-info').textContent = discountInfo;

        return total;
    }

    // Функции для работы с API
    async function registerClient(clientData) {
        const response = await fetch(`${API_BASE_URL}/api/register/client`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(clientData),
        });

        if (!response.ok) {
            const errorData = await response.json();
            return {error: errorData.error || 'Ошибка при регистрации'};
        }

        return await response.json();
    }

    async function loginClient(credentials) {
        const response = await fetch(`${API_BASE_URL}/api/login/client`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(credentials),
        });

        if (!response.ok) {
            const errorData = await response.json();
            return {error: errorData.error || 'Ошибка при входе'};
        }

        return await response.json();
    }

    async function submitOrder(orderData) {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`${API_BASE_URL}/api/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    client: orderData.client,
                    services: orderData.services, // Убедитесь, что это массив объектов
                    totalAmount: orderData.totalAmount,
                    discountInfo: orderData.discountInfo
                }),
            });

            // Добавьте проверку content-type
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Ожидался JSON, но получили:', text.substring(0, 100));
                throw new Error('Сервер вернул не JSON ответ');
            }

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Order error details:', errorData);
                return {error: errorData.error || 'Ошибка при оформлении заказа'};
            }

            return await response.json();
        } catch (error) {
            console.error('Order submission error:', error);
            return {error: error.message};
        }
    }

    async function submitApplication(applicationData) {
        const formData = new FormData();
        formData.append('name', applicationData.name);
        formData.append('experience', applicationData.experience);
        formData.append('address', applicationData.address);
        formData.append('phone', applicationData.phone);
        if (applicationData.photo) {
            formData.append('photo', applicationData.photo);
        }

        const response = await fetch(`${API_BASE_URL}/api/applications`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            return {error: 'Ошибка при отправке заявки'};
        }

        return await response.json();
    }


    async function registerEmployee(employeeData) {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`${API_BASE_URL}/api/register/employee`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(employeeData),
            });

            // Добавьте проверку content-type
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                throw new Error(`Ожидался JSON, но получили: ${text.substring(0, 100)}...`);
            }

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Ошибка при регистрации сотрудника');
            }

            return result;
        } catch (error) {
            console.error('Ошибка при регистрации сотрудника:', error);
            return {error: error.message};
        }
    }

    async function deleteEmployee(employeeId) {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            return {error: 'Ошибка при удалении сотрудника'};
        }

        return await response.json();
    }

    function setupEventListeners() {
        // Обработчики модальных окон
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', function (e) {
                if (e.target === this) {
                    this.style.display = 'none';
                }
            });
        });

        // Обработчик создания документа
        document.getElementById('create-service-btn').addEventListener('click', async function () {
            console.log('Кнопка "Создать документ" нажата');
            const token = localStorage.getItem('token');
            if (!token) {
                alert('Пожалуйста, войдите в систему');
                return;
            }

            try {
                const user = JSON.parse(atob(token.split('.')[1]));
                if (user.role !== 'admin' && user.role !== 'employee') {
                    alert('Недостаточно прав для выполнения этой операции');
                    return;
                }

                console.log('Запрос списка заказов...');
                const orders = await getOrders();
                console.log('Полученные заказы:', orders);

                if (orders.error) {
                    console.error('Ошибка при получении заказов:', orders.error);
                    alert('Ошибка: ' + orders.error);
                    return;
                }

                if (orders.length === 0) {
                    alert('Нет доступных заказов для обработки');
                    return;
                }

                const select = document.getElementById('order-select');
                select.innerHTML = '<option value="">Выберите заказ</option>';
                orders.forEach(order => {
                    const option = document.createElement('option');
                    option.value = order.id;
                    option.textContent = `Заказ #${order.id} - ${order.client_name} (${new Date(order.order_date).toLocaleDateString()})`;
                    select.appendChild(option);
                });

                document.getElementById('service-document-modal').style.display = 'flex';
            } catch (e) {
                console.error('Ошибка:', e);
                alert('Ошибка: ' + e.message);
            }
        });

        // обработчик выбора заказа
        document.getElementById('order-select').addEventListener('change', async function () {
            const orderId = this.value;
            if (!orderId) {
                document.getElementById('order-details').style.display = 'none';
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Ошибка при получении заказа');
                }

                const order = await response.json();

                const orderInfo = document.getElementById('order-info');
                orderInfo.innerHTML = `
            <p><strong>Клиент:</strong> ${order.client_name}</p>
            <p><strong>Дата заказа:</strong> ${new Date(order.order_date).toLocaleString()}</p>
            <p><strong>Сумма:</strong> ${parseFloat(order.total_amount).toLocaleString()} ₽</p>
            <p><strong>Скидки:</strong> ${order.discount_info || 'нет'}</p>
            <h4>Услуги:</h4>
            <ul>
                ${order.services.map(service =>
                    `<li>${service.name} (${service.quantity} × ${service.price} ₽)</li>`
                ).join('')}
            </ul>
            <p><strong>Комиссия (20%):</strong> ${(parseFloat(order.total_amount) * 0.2).toLocaleString()} ₽</p>
            <p><strong>Доход конторы:</strong> ${(parseFloat(order.total_amount) * 0.8).toLocaleString()} ₽</p>
        `;

                document.getElementById('order-details').style.display = 'block';
            } catch (error) {
                console.error('Ошибка при загрузке заказа:', error);
                alert('Ошибка: ' + error.message);
            }
        });

        // Обработчик поиска
        document.querySelector('.search-box button').addEventListener('click', async function(e) {
            e.preventDefault();
            const searchInput = document.getElementById('search-input');
            const query = searchInput.value.trim();

            if (query.length < 2) {
                alert('Введите минимум 2 символа для поиска');
                return;
            }

            const results = await performSearch(query);
            if (results.error) {
                alert(results.error);
                return;
            }

            displaySearchResults(results);
        });

        // Обработчик нажатия Enter в поле поиска
        document.getElementById('search-input').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                document.querySelector('.search-box button').click();
            }
        });

        // Вход для сотрудников
        document.getElementById('employee-login').addEventListener('click', function () {
            document.getElementById('admin-login-modal').style.display = 'flex';
        });

        // Вход для клиентов
        document.getElementById('client-login').addEventListener('click', function () {
            document.getElementById('client-auth-modal').style.display = 'flex';
        });

        // Переключение между вкладками входа/регистрации
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const tabId = this.getAttribute('data-tab');

                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));

                this.classList.add('active');
                document.getElementById(`client-${tabId}-form`).classList.add('active');
            });
        });

        // Форма регистрации клиента
        document.getElementById('client-register-form').addEventListener('submit', async function (e) {
            e.preventDefault();
            const clientData = {
                name: document.getElementById('client-reg-name').value,
                email: document.getElementById('client-reg-email').value,
                password: document.getElementById('client-reg-password').value,
                phone: document.getElementById('client-reg-phone').value,
                address: document.getElementById('client-reg-address').value
            };

            const result = await registerClient(clientData);
            if (result.error) {
                alert('Ошибка при регистрации: ' + result.error);
                return;
            }

            currentUser = result.user;
            localStorage.setItem('token', result.token);
            alert('Регистрация прошла успешно!');
            document.getElementById('client-auth-modal').style.display = 'none';
            document.getElementById('client-login').textContent = 'Личный кабинет';
        });

        // Форма входа клиента
        document.getElementById('client-login-form').addEventListener('submit', async function (e) {
            e.preventDefault();
            const credentials = {
                email: document.getElementById('client-login-email').value,
                password: document.getElementById('client-login-password').value
            };

            try {
                const response = await fetch(`${API_BASE_URL}/api/login/client`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(credentials),
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Ошибка при входе');
                }

                currentUser = result.user;
                localStorage.setItem('token', result.token);
                alert('Вход выполнен успешно!');
                document.getElementById('client-auth-modal').style.display = 'none';
                document.getElementById('client-login').textContent = 'Личный кабинет';
            } catch (error) {
                alert('Ошибка при входе: ' + error.message);
            }
        });

        // Заявка на работу
        document.getElementById('employee-requests').addEventListener('click', function () {
            document.getElementById('job-application-modal').style.display = 'flex';
        });

        document.getElementById('application-form').addEventListener('submit', async function (e) {
            e.preventDefault();
            const application = {
                name: document.getElementById('applicant-name').value,
                experience: document.getElementById('experience').value,
                address: document.getElementById('applicant-address').value,
                phone: document.getElementById('applicant-phone').value,
                photo: document.getElementById('photo').files[0]
            };

            const result = await submitApplication(application);
            if (result.error) {
                alert('Ошибка при отправке заявки: ' + result.error);
                return;
            }

            alert('Ваша заявка отправлена!');
            this.reset();
            document.getElementById('job-application-modal').style.display = 'none';
        });

        // Вход для сотрудников
        document.getElementById('admin-login-form').addEventListener('submit', async function (e) {
            e.preventDefault();
            const login = document.getElementById('admin-login').value;
            const password = document.getElementById('admin-password').value;

            try {
                const response = await fetch(`${API_BASE_URL}/api/login/employee`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({email: login, password: password}),
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Неверный логин или пароль');
                }

                localStorage.setItem('token', data.token);
                isAdmin = data.user.role === 'admin';
                currentUser = data.user;

                alert('Вы успешно вошли!');
                document.getElementById('admin-login-modal').style.display = 'none';

                // Показываем соответствующие кнопки
                document.getElementById('employee-requests').style.display = 'block';
                document.getElementById('create-service-btn').style.display = 'block';

                if (isAdmin) {
                    document.getElementById('employee-login').textContent = 'Панель администратора';
                    document.getElementById('admin-settings').style.display = 'block';
                }
            } catch (error) {
                alert('Ошибка при входе: ' + error.message);
            }
        });

        // Панель администратора
        document.getElementById('admin-settings').addEventListener('click', async function () {
            document.getElementById('admin-panel-modal').style.display = 'flex';
            await renderAdminPanel();
        });

        document.getElementById('database-btn').addEventListener('click', async function() {
            document.getElementById('database-section').style.display = 'block';
            document.getElementById('employees-section').style.display = 'none';
            await renderClientsList(); // Эта функция использует getClients()
        });

        document.getElementById('employees-btn').addEventListener('click', async function () {
            document.getElementById('database-section').style.display = 'none';
            document.getElementById('employees-section').style.display = 'block';
            await renderApplicationsList();
            await renderEmployeesList();
        });

        // Управление сотрудниками
        document.getElementById('register-btn').addEventListener('click', async function () {
            const appId = parseInt(document.getElementById('employee-id').value);

            try {
                const applications = await getApplications();
                if (applications.error) throw new Error(applications.error);

                const application = applications.find(app => app.id === appId);
                if (!application) throw new Error('Заявка не найдена');

                const login = prompt('Введите логин для нового сотрудника:');
                const password = prompt('Введите пароль для нового сотрудника:');

                if (login && password) {
                    const result = await registerEmployee({
                        name: application.name,
                        email: login,
                        password: password,
                        position: 'employee',
                        experience: application.experience,
                        photo_url: application.photo_url,
                        address: application.address,
                        phone: application.phone
                    });

                    if (result.error) throw new Error(result.error);

                    alert('Сотрудник зарегистрирован!');
                    await renderEmployeesList();
                }
            } catch (error) {
                alert('Ошибка: ' + error.message);
            }
        });

        document.getElementById('delete-btn').addEventListener('click', async function () {
            const empId = parseInt(document.getElementById('employee-id').value);

            try {
                const result = await deleteEmployee(empId);
                if (result.error) throw new Error(result.error);

                alert('Сотрудник удален!');
                await renderEmployeesList();
            } catch (error) {
                alert('Ошибка: ' + error.message);
            }
        });

        // Форма заказа
        document.getElementById('order-form').addEventListener('submit', async function (e) {
            e.preventDefault();

            if (selectedServices.length === 0) {
                alert('Выберите хотя бы одну услугу');
                return;
            }

            if (!currentUser) {
                alert('Пожалуйста, войдите в систему для оформления заказа');
                document.getElementById('client-auth-modal').style.display = 'flex';
                return;
            }

            const totalAmount = updateTotal(); // Получаем сумму со скидкой
            const discountInfo = document.getElementById('discount-info').textContent;

            const client = {
                name: document.getElementById('client-name').value,
                activity: document.getElementById('client-activity').value,
                address: document.getElementById('client-address').value,
                phone: document.getElementById('client-phone').value,
                type: document.getElementById('client-activity').value ? 'legal' : 'individual'
            };

            try {
                const result = await submitOrder({
                    client,
                    services: selectedServices,
                    totalAmount,
                    discountInfo
                });

                if (result.error) {
                    console.error('Order error:', result.error);
                    throw new Error(result.error);
                }

                alert(`Сделка для ${client.name} на сумму ${totalAmount.toLocaleString()} ₽ успешно оформлена!`);
                isNewClient = false;

                // Сброс формы
                this.reset();
                selectedServices = [];
                document.getElementById('services-container').innerHTML = '';
                document.getElementById('total-amount').textContent = '0';
                document.getElementById('discount-info').textContent = 'Доступные скидки будут рассчитаны автоматически';
            } catch (error) {
                console.error('Order submission failed:', error);
                alert('Ошибка при оформлении заказа: ' + error.message);
            }
        });

        document.getElementById('create-service-btn').addEventListener('click', async function () {
            // Загружаем список клиентов
            const clients = await getClients();
            if (clients.error) {
                alert(clients.error);
                return;
            }

            const select = document.getElementById('client-select');
            select.innerHTML = '<option value="">Выберите клиента</option>';
            clients.forEach(client => {
                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = `${client.name} (${client.phone})`;
                select.appendChild(option);
            });

            document.getElementById('service-document-modal').style.display = 'flex';
        });

        document.getElementById('service-document-form').addEventListener('submit', async function(e) {
            e.preventDefault();

            const orderId = document.getElementById('order-select').value;
            const responseText = document.getElementById('response-text').value;

            if (!orderId || !responseText) {
                alert('Заполните все обязательные поля');
                return;
            }

            try {
                console.log('Отправка данных для создания документа:', {
                    orderId,
                    responseText
                });

                const response = await fetch(`${API_BASE_URL}/api/service-documents`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({
                        order_id: orderId,
                        response_text: responseText
                    })
                });

                // Проверка типа содержимого
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    const text = await response.text();
                    console.error('Сервер вернул не JSON:', text);
                    throw new Error(`Ошибка сервера: ${text.substring(0, 100)}`);
                }

                const result = await response.json();

                if (!response.ok) {
                    console.error('Ошибка сервера:', result);
                    throw new Error(result.error || 'Неизвестная ошибка сервера');
                }

                alert(`Документ №${result.document_number} успешно создан!`);

                // Закрытие модального окна и сброс формы
                this.reset();
                document.getElementById('service-document-modal').style.display = 'none';
                document.getElementById('order-details').style.display = 'none';

            } catch (error) {
                console.error('Ошибка при создании документа:', error);
                alert(`Ошибка: ${error.message}`);
            }
        });

        // Закрытие модальных окон
        document.querySelectorAll('.close').forEach(btn => {
            btn.addEventListener('click', function () {
                this.closest('.modal').style.display = 'none';
            });
        });
    }

    // Вспомогательные функции
    function addService(name, price) {
        const existingService = selectedServices.find(s => s.name === name);
        if (existingService) {
            existingService.quantity += 1;
        } else {
            selectedServices.push({
                name: name,
                price: price,
                quantity: 1,
                id: Date.now()
            });
        }
        renderSelectedServices();
    }

    function renderSelectedServices() {
        const container = document.getElementById('services-container');
        container.innerHTML = '';

        selectedServices.forEach(service => {
            const serviceElement = document.createElement('div');
            serviceElement.className = 'service-item';
            serviceElement.innerHTML = `
                <div class="service-info">
                    <span>${service.name} (${service.quantity} × ${service.price.toLocaleString()} ₽)</span>
                    <span class="service-total">${(service.quantity * service.price).toLocaleString()} ₽</span>
                </div>
                <button class="remove-service" data-id="${service.id}">×</button>
            `;
            container.appendChild(serviceElement);
        });

        document.querySelectorAll('.remove-service').forEach(btn => {
            btn.addEventListener('click', function () {
                const serviceId = parseInt(this.getAttribute('data-id'));
                removeService(serviceId);
            });
        });
    }
});
