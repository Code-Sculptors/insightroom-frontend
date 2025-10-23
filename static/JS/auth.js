class AuthService {
    constructor() {
        this.isRefreshing = false;
        this.failedQueue = [];
        this.is_login = false;
        // Токены теперь хранятся в куках, а не в localStorage
    }

    async login(json_data) {
        const response = await fetch('api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(json_data),
            credentials: 'include'  // Важно: отправляем куки
        });

        if (response.ok) {
            const data = await response.json();
            
            // Сохраняем время истечения в localStorage (это можно оставить)
            this.setTokenExpiry('access', data.access_expires_in);
            this.setTokenExpiry('refresh', data.refresh_expires_in);
            
            this.is_login = true;
            return true;
        } else {
            console.log('error in login() auth.js')
            const data = await response.json();
            return data.error;
        }
    }

    async register(json_data){
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(json_data),
            credentials: 'include'  // Важно: отправляем куки
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Сохраняем время истечения
            this.setTokenExpiry('access', data.access_expires_in);
            this.setTokenExpiry('refresh', data.refresh_expires_in);
            
            this.is_login = true;
            return true;
        } else {
            return data.error;
        }
    }

    // Эти методы больше не нужны для установки токенов, но оставим для времени истечения
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
                credentials: 'include'  // Отправляем куки с refresh token
            });

            if (response.ok) {
                const data = await response.json();
                // Сервер автоматически обновит access token в куках
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
        
        // Очищаем данные
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
        // Убедимся, что отправляем куки
        options.credentials = 'include';

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

        let response = await fetch(url, options);
        
        // Если access token истек на сервере (маловероятно, но возможно)
        if (response.status === 401) {
            const errorData = await response.json();
            
            if (errorData.error === 'access_token_expired') {
                if (!this.isTokenExpired('refresh')) {
                    await this.refreshAccessToken();
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
        fetch('api/logout', {
            method: 'POST',
            credentials: 'include'  // Отправляем куки с токенами
        }).catch(console.error);
        
        // Очищаем локальное хранилище (только expiry данные)
        this.is_login = false;
        localStorage.removeItem('access_token_expiry');
        localStorage.removeItem('refresh_token_expiry');
    }

    isAuthenticated() {
        // Теперь проверяем только по expiry времени
        // В идеале нужно делать запрос к серверу для проверки валидности кук
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
    
    const success = await authService.login({username, password});
    if (success === true) {
        authService.is_login = true;
        window.location.href = '/dashboard';
    } else {
        alert('Ошибка входа. Проверьте логин и пароль.');
    }
}

async function fetchProtectedData(url='/api/protected-data') {
    try {
        const response = await authService.makeAuthenticatedRequest(url);
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