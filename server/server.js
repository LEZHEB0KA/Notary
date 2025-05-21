const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Инициализация приложения
const app = express();

// Настройки подключения к PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'Notary',
    password: '12345',
    port: 5432,
});

const JWT_SECRET = 'your_jwt_secret_key';

// Настройка Multer для загрузки файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:63342'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Логирование запросов
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Middleware для проверки JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Неверный токен' });
        req.user = user;
        next();
    });
}

// Регистрация клиента
app.post('/api/register/client', async (req, res) => {
    try {
        const { name, email, password, phone, address } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO clients (name, email, password, phone, address, registration_date)
             VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id, name, email`,
            [name, email, hashedPassword, phone, address]
        );

        const token = jwt.sign({ id: result.rows[0].id, role: 'client' }, JWT_SECRET);
        res.json({ user: result.rows[0], token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.detail || 'Ошибка при регистрации' });
    }
});

// Вход клиента
app.post('/api/login/client', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM clients WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }

        const validPassword = await bcrypt.compare(password, result.rows[0].password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }

        const token = jwt.sign({ id: result.rows[0].id, role: 'client' }, JWT_SECRET);
        res.json({
            user: {
                id: result.rows[0].id,
                name: result.rows[0].name,
                email: result.rows[0].email
            },
            token
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при входе' });
    }
});

// Вход сотрудника/администратора
app.post('/api/login/employee', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Login attempt for:', email);

        const result = await pool.query('SELECT * FROM employees WHERE email = $1', [email]);
        console.log('User found:', result.rows.length > 0);

        if (result.rows.length === 0) {
            console.log('User not found');
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }

        const user = result.rows[0];
        console.log('Stored hash:', user.password);
        console.log('Input password:', password);

        const validPassword = await bcrypt.compare(password, user.password);
        console.log('Password comparison result:', validPassword);

        if (!validPassword) {
            console.log('Invalid password');
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }

        const token = jwt.sign({
            id: user.id,
            role: user.is_admin ? 'admin' : 'employee'
        }, JWT_SECRET);

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.is_admin ? 'admin' : 'employee'
            },
            token
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Ошибка при входе' });
    }
});

// Обработка заявки на работу с фото
app.post('/api/applications', upload.single('photo'), async (req, res) => {
    try {
        const { name, experience, address, phone } = req.body;
        const photo_url = req.file ? req.file.filename : null;

        const result = await pool.query(
            `INSERT INTO applications (name, experience, photo_url, address, phone, application_date)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
            [name, experience, photo_url, address, phone]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при сохранении заявки' });
    }
});


// Сохранение данных клиента при заказе
app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
        const { client, services, totalAmount, discountInfo } = req.body;
        const clientId = req.user.id;

        // Убедитесь, что это новый клиент
        const clientCheck = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
        if (clientCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Клиент не найден' });
        }

        // Создаем заказ со статусом 'pending'
        const result = await pool.query(
            `INSERT INTO orders (client_id, services, total_amount, discount_info, order_date, status)
             VALUES ($1, $2, $3, $4, NOW(), 'pending') RETURNING *`,
            [clientId, JSON.stringify(services), totalAmount, discountInfo]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Order save error:', err);
        res.status(500).json({ error: 'Ошибка при сохранении заказа', details: err.message });
    }
});

// Регистрация сотрудника (для администратора)
app.post('/api/register/employee', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const { name, email, password, position, experience, photo_url, address, phone } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO employees (name, email, password, position, experience, photo_url, address, phone, is_admin, registration_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
            [name, email, hashedPassword, position, experience, photo_url, address, phone, position === 'admin']
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.detail || 'Ошибка при регистрации сотрудника' });
    }
});

// Получение списка клиентов (для администратора и сотрудников)
app.get('/api/clients', authenticateToken, async (req, res) => {
    // Разрешаем доступ администраторам и сотрудникам
    if (req.user.role !== 'admin' && req.user.role !== 'employee') {
        return res.sendStatus(403);
    }

    try {
        const result = await pool.query('SELECT id, name, email, phone, address, type, registration_date FROM clients');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при получении клиентов' });
    }
});

// Получение списка заявок (для администратора)
app.get('/api/applications', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const result = await pool.query(`
            SELECT id, name, experience, photo_url, address, phone, application_date
            FROM applications
            ORDER BY application_date DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при получении заявок' });
    }
});

// Получение списка сотрудников (для администратора)
app.get('/api/employees', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const result = await pool.query(`
            SELECT id, name, email, phone, address, position, experience, 
            photo_url, is_admin, registration_date 
            FROM employees
            ORDER BY registration_date DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при получении сотрудников' });
    }
});

// Удаление сотрудника (для администратора)
app.delete('/api/employees/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const result = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING *', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Сотрудник не найден' });
        }
        res.json({ message: 'Сотрудник удален' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при удалении сотрудника' });
    }
});

// Создание администратора при первом запуске
async function createAdmin() {
    try {
        const adminExists = await pool.query('SELECT * FROM employees WHERE email = $1', ['admin']);
        if (adminExists.rows.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await pool.query(
                `INSERT INTO employees (name, email, password, position, is_admin, registration_date)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
                ['Администратор', 'admin', hashedPassword, 'admin', true]
            );
            console.log('Администратор создан: admin / admin123');
        }
    } catch (err) {
        console.error('Ошибка при создании администратора:', err);
    }
}



// Получение всех оказанных услуг для сотрудника
app.get('/api/services/employee', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT sp.*, c.name as client_name 
             FROM services_provided sp
             JOIN clients c ON sp.client_id = c.id
             WHERE sp.employee_id = $1`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при получении услуг' });
    }
});

// Получение всех оказанных услуг (для администратора)
app.get('/api/services', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const result = await pool.query(
            `SELECT sp.*, c.name as client_name, e.name as employee_name
             FROM services_provided sp
             JOIN clients c ON sp.client_id = c.id
             JOIN employees e ON sp.employee_id = e.id`
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при получении услуг' });
    }
});

// Запуск сервера
const PORT = 3001;
app.listen(PORT, async () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    // Создание администратора при первом запуске
    try {
        const adminExists = await pool.query('SELECT * FROM employees WHERE email = $1', ['admin']);
        if (adminExists.rows.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await pool.query(
                `INSERT INTO employees (name, email, password, position, is_admin, registration_date)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                ['Администратор', 'admin', hashedPassword, 'admin', true]
            );
            console.log('Администратор создан: admin / admin123');
        }
    } catch (err) {
        console.error('Ошибка при создании администратора:', err);
    }
});

// Добавьте этот код в server.js (рядом с другими /api/orders)
app.get('/api/orders/:id', authenticateToken, async (req, res) => {
    try {
        const orderId = req.params.id;
        console.log(`Fetching order with ID: ${orderId}`);

        const result = await pool.query(`
            SELECT o.*, c.name as client_name
            FROM orders o
            JOIN clients c ON o.client_id = c.id
            WHERE o.id = $1
        `, [orderId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching order:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Функция для отображения списка документов
async function showServicesList() {
    const services = isAdmin ? await getAllServices() : await getEmployeeServices();
    if (services.error) {
        alert(services.error);
        return;
    }

    const container = document.getElementById('services-list-container');
    container.innerHTML = '';

    if (services.length === 0) {
        container.innerHTML = '<p>Нет данных об оказанных услугах</p>';
        return;
    }

    services.forEach(service => {
        const serviceElement = document.createElement('div');
        serviceElement.className = 'service-document';
        serviceElement.innerHTML = `
            <h3>Документ № ${service.document_number}</h3>
            <p><strong>Клиент:</strong> ${service.client_name}</p>
            <p><strong>Дата:</strong> ${new Date(service.service_date).toLocaleString()}</p>
            <p><strong>Сумма:</strong> ${service.total_amount.toLocaleString()} ₽</p>
            <p><strong>Комиссия:</strong> ${service.commission.toLocaleString()} ₽</p>
            <p><strong>Описание:</strong> ${service.description}</p>
            <div class="services-details">
                <h4>Оказанные услуги:</h4>
                ${JSON.parse(service.services).map(s => `
                    <p>${s.name} (${s.quantity} × ${s.price.toLocaleString()} ₽)</p>
                `).join('')}
            </div>
        `;
        container.appendChild(serviceElement);
    });

    document.getElementById('services-list-modal').style.display = 'flex';
}


// Замените текущий обработчик /api/orders на этот:
app.get('/api/orders', authenticateToken, async (req, res) => {
    console.log('Start processing /api/orders'); // Добавьте это

    try {
        console.log('Executing SQL query...');
        const result = await pool.query(`
            SELECT o.*, c.name as client_name
            FROM orders o
            JOIN clients c ON o.client_id = c.id
            WHERE o.status = 'pending'
            ORDER BY o.order_date DESC
        `);
        console.log('Query result:', result.rows); // И это

        res.json(result.rows);
    } catch (err) {
        console.error('Full error:', err); // Подробное логирование
        res.status(500).json({ error: err.message }); // Возвращаем настоящую ошибку
    }
});

app.get('/api/clients', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'employee') {
        return res.sendStatus(403);
    }

    try {
        const result = await pool.query(`
            SELECT id, name, email, phone, address, type, registration_date 
            FROM clients
            ORDER BY registration_date DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при получении клиентов' });
    }
});


// Создание документа об оказанной услуге
app.post('/api/service-documents', authenticateToken, async (req, res) => {
    try {
        console.log('Получен запрос на создание документа:', {
            body: req.body,
            user: req.user
        });

        // Проверка обязательных полей
        if (!req.body.order_id || !req.body.response_text) {
            console.error('Отсутствуют обязательные поля');
            return res.status(400).json({
                error: 'Необходимо указать order_id и response_text'
            });
        }

        const { order_id, response_text } = req.body;
        const employee_id = req.user.id;

        // 1. Получаем данные заказа
        const orderResult = await pool.query(
            'SELECT * FROM orders WHERE id = $1',
            [order_id]
        );

        if (orderResult.rows.length === 0) {
            console.error('Заказ не найден, ID:', order_id);
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        const order = orderResult.rows[0];
        console.log('Найден заказ:', order);

        // Проверка статуса заказа
        if (order.status !== 'pending') {
            console.error('Заказ уже обработан, статус:', order.status);
            return res.status(400).json({ error: 'Заказ уже обработан' });
        }

        // Проверка и преобразование services
        let services;
        try {
            services = typeof order.services === 'string'
                ? JSON.parse(order.services)
                : order.services;
        } catch (e) {
            console.error('Ошибка парсинга services:', e);
            return res.status(400).json({ error: 'Некорректный формат услуг в заказе' });
        }

        // 2. Генерация номера документа
        const lastDoc = await pool.query(
            'SELECT document_number FROM services_provided ORDER BY id DESC LIMIT 1'
        );

        let nextNumber = 1;
        if (lastDoc.rows.length > 0) {
            const lastNumber = lastDoc.rows[0].document_number?.split('-')[2];
            nextNumber = parseInt(lastNumber || '0') + 1;
        }

        const document_number = `SRV-${new Date().getFullYear()}-${nextNumber.toString().padStart(4, '0')}`;
        console.log('Сгенерирован номер документа:', document_number);

        // 3. Расчет финансовых показателей
        const total_amount = parseFloat(order.total_amount);
        const commission = total_amount * 0.2;
        const income = total_amount - commission;

        console.log('Финансовые данные:', {
            total_amount,
            commission,
            income
        });

        // 4. Создание документа
        const insertQuery = `
            INSERT INTO services_provided (
                employee_id, client_id, order_id, services, 
                total_amount, commission, income, 
                response_text, document_number, service_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            RETURNING *
        `;

        const result = await pool.query(insertQuery, [
            employee_id,
            order.client_id,
            order_id,
            JSON.stringify(services), // Явное преобразование в JSON
            total_amount,
            commission,
            income,
            response_text,
            document_number
        ]);

        // 5. Обновление статуса заказа
        await pool.query(
            'UPDATE orders SET status = $1 WHERE id = $2',
            ['completed', order_id]
        );

        console.log('Документ успешно создан:', result.rows[0]);
        res.json(result.rows[0]);

    } catch (err) {
        console.error('Ошибка создания документа:', {
            message: err.message,
            stack: err.stack,
            body: req.body
        });
        res.status(500).json({
            error: 'Ошибка при создании документа',
            details: process.env.NODE_ENV !== 'production' ? err.message : undefined
        });
    }
});

// Получение документов клиента
app.get('/api/client/documents', authenticateToken, async (req, res) => {
    if (req.user.role !== 'client') return res.sendStatus(403);

    try {
        const result = await pool.query(`
            SELECT sp.*, e.name as employee_name
            FROM services_provided sp
            JOIN employees e ON sp.employee_id = e.id
            WHERE sp.client_id = $1
            ORDER BY sp.service_date DESC
        `, [req.user.id]);

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при получении документов' });
    }
});

// endpoint для поиска
app.get('/api/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || query.trim().length < 2) {
            return res.status(400).json({ error: 'Минимальная длина запроса - 2 символа' });
        }

        const searchQuery = `%${query}%`;

        // Ищем по услугам, клиентам и сотрудникам
        const [services, clients, employees] = await Promise.all([
            pool.query(`
                SELECT id, name as title, price, 'service' as type 
                FROM services 
                WHERE name ILIKE $1
            `, [searchQuery]),

            pool.query(`
                SELECT id, name as title, 'client' as type 
                FROM clients 
                WHERE name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1
            `, [searchQuery]),

            pool.query(`
                SELECT id, name as title, position, 'employee' as type 
                FROM employees 
                WHERE name ILIKE $1 OR email ILIKE $1 OR position ILIKE $1
            `, [searchQuery])
        ]);

        res.json({
            services: services.rows,
            clients: clients.rows,
            employees: employees.rows
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'Ошибка при выполнении поиска' });
    }
});

