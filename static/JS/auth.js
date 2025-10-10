class AuthService {
    constructor() {
        this.accessToken = localStorage.getItem('access_token');
        this.refreshToken = localStorage.getItem('refresh_token');
        this.isRefreshing = false;
        this.failedQueue = [];
        this.is_login = false;
    }

    async login(username, password) {
        try {
            const response = await fetch('api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                const data = await response.json();
                this.setTokens(data.access_token, data.refresh_token);
                // Сохраняем время истечения
                this.setTokenExpiry('access', data.access_expires_in);
                this.setTokenExpiry('refresh', data.refresh_expires_in);
                
                return true;
            } else {
                throw new Error('Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            return false;
        }
    }

    setTokens(accessToken, refreshToken) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
    }

    setTokenExpiry(tokenType, expiresIn) {
        const expiryTime = Date.now() + (expiresIn * 1000);
        localStorage.setItem(`${tokenType}_token_expiry`, expiryTime.toString());
    }

    isTokenExpired(tokenType) {
        const expiry = localStorage.getItem(`${tokenType}_token_expiry`);
        if (!expiry) return true;
        return Date.now() >= parseInt(expiry);
    }

    async refreshAccessToken() {
        // Если уже обновляем токен, добавляем запрос в очередь
        if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
                this.failedQueue.push({ resolve, reject });
            });
        }

        this.isRefreshing = true;

        try {
            // Проверяем, не истек ли refresh token
            if (this.isTokenExpired('refresh')) {
                throw new Error('REFRESH_TOKEN_EXPIRED');
            }

            const response = await fetch('api/refresh', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.refreshToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.accessToken = data.access_token;
                localStorage.setItem('access_token', data.access_token);
                this.setTokenExpiry('access', data.access_expires_in);

                // Обрабатываем очередь запросов
                this.failedQueue.forEach(({ resolve }) => resolve());
                this.failedQueue = [];

                return true;
            } else {
                const errorData = await response.json();
                
                if (errorData.error === 'refresh_token_expired') {
                    throw new Error('REFRESH_TOKEN_EXPIRED');
                } else {
                    throw new Error('REFRESH_FAILED');
                }
            }
        } catch (error) {
            // Обрабатываем ошибки в очереди
            this.failedQueue.forEach(({ reject }) => reject(error));
            this.failedQueue = [];

            if (error.message === 'REFRESH_TOKEN_EXPIRED') {
                this.handleRefreshTokenExpired();
            }
            
            throw error;
        } finally {
            this.isRefreshing = false;
        }
    }

    handleRefreshTokenExpired() {
        console.log('Refresh token истек. Требуется полная переаутентификация.');
        
        // Очищаем токены
        this.logout();
        
        // Показываем пользователю сообщение
        this.showReauthenticationRequired();
        
        // Перенаправляем на страницу логина
        setTimeout(() => {
            window.location.href = '/login?reason=session_expired';
        }, 2000);
    }

    showReauthenticationRequired() {
        // Показываем красивое сообщение пользователю
        const message = document.createElement('div');
        message.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff6b6b;
            color: white;
            padding: 15px;
            border-radius: 5px;
            z-index: 10000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        `;
        message.textContent = 'Сессия истекла. Пожалуйста, войдите снова.';
        document.body.appendChild(message);
        
        setTimeout(() => {
            document.body.removeChild(message);
        }, 5000);
    }

    async makeAuthenticatedRequest(url, options = {}) {
        // Проверяем, не истек ли access token
        if (this.isTokenExpired('access') && !this.isTokenExpired('refresh')) {
            try {
                await this.refreshAccessToken();
            } catch (error) {
                if (error.message === 'REFRESH_TOKEN_EXPIRED') {
                    // Уже обработано в handleRefreshTokenExpired
                    return;
                }
                throw error;
            }
        }

        if (!this.accessToken) {
            throw new Error('No access token');
        }

        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${this.accessToken}`
        };
        let response = await fetch(url, options);
        // Если access token истек на сервере (маловероятно, но возможно)
        if (response.status === 401) {
            const errorData = await response.json();
            
            if (errorData.error === 'access_token_expired') {
                if (!this.isTokenExpired('refresh')) {
                    await this.refreshAccessToken();
                    options.headers['Authorization'] = `Bearer ${this.accessToken}`;
                    response = await fetch(url, options);
                } else {
                    this.handleRefreshTokenExpired();
                    return;
                }
            }
        }

        return response;
    }

    logout() {
        // Отправляем запрос на сервер для добавления в черный список

        if (this.accessToken) {
            fetch('api/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`,
                },
                body: JSON.stringify({'refresh_token': this.refreshToken})
            }).catch(console.error);
        }
        // Очищаем локальное хранилище
        this.accessToken = null;
        this.refreshToken = null;
        this.is_login = false;
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('access_token_expiry');
        localStorage.removeItem('refresh_token_expiry');
    }

    isAuthenticated() {
        return !this.isTokenExpired('access') || !this.isTokenExpired('refresh');
    }

    // Периодическая проверка состояния аутентификации
    startTokenMonitor() {
        setInterval(() => {
            if (this.is_login){
                if (this.isTokenExpired('refresh')) {
                    this.handleRefreshTokenExpired();
                } else if (this.isTokenExpired('access') && !this.isRefreshing) {
                    this.refreshAccessToken().catch(console.error);
                }
            }
        }, 60000); // Проверка каждую минуту
    }
}

const authService = new AuthService();

document.addEventListener('DOMContentLoaded', function() {
    authService.startTokenMonitor();
});

// Дополнительные функции для использования в HTML
async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    const success = await authService.login(username, password);
    if (success) {
        this.is_login = success;
        window.location.href = '/dashboard';
    } else {
        alert('Ошибка входа. Проверьте логин и пароль.');
    }
}

function handleLogout() {
    authService.logout();
    window.location.href = '/';
}

async function fetchProtectedData() {
    try {
        const response = await authService.makeAuthenticatedRequest('/api/protected-data');
        if (response && response.ok) {
            const data = await response.json();
            return data;
        }
    } catch (error) {
        console.error('Ошибка при получении данных:', error);
    }
}

function checkAuth() {
    if (!authService.isAuthenticated() && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
    }
}