from flask import Flask, render_template, request, jsonify, make_response
import os
import json

app = Flask(__name__, template_folder=os.path.dirname(os.path.abspath(__file__)) + '/pages')

# Временное хранилище пользователей (замените на базу данных)
users_db = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/<file_name>')
def view(file_name: str):
    if file_name == 'favicon.ico':
        with open(os.path.dirname(os.path.abspath(__file__)) + '/static/images/favicon.ico', mode='rb') as ico:
            return ico.read()
    return render_template(file_name + '.html')

# API endpoints
@app.route('/api/register', methods=['POST'])
def api_register():
    try:
        data = request.get_json()
        
        # Проверка обязательных полей
        required_fields = ['username', 'login', 'email', 'password']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'Поле {field} обязательно'}), 400
        
        # Проверка на существующего пользователя
        if data['login'] in users_db:
            return jsonify({'error': 'Пользователь с таким логином уже существует'}), 400
        
        if data['email'] in [user['email'] for user in users_db.values()]:
            return jsonify({'error': 'Пользователь с таким email уже существует'}), 400
        
        # Сохраняем пользователя
        users_db[data['login']] = {
            'username': data['username'],
            'email': data['email'],
            'tel': data.get('tel', ''),
            'password': data['password']  # В реальном приложении хэшируйте пароль!
        }
        
        # Имитация успешной регистрации
        response = jsonify({
            'message': 'Регистрация успешна',
            'access_expires_in': 3600,  # 1 час
            'refresh_expires_in': 2592000  # 30 дней
        })
        
        # Устанавливаем куки (имитация)
        response.set_cookie('access_token', 'mock_access_token', max_age=3600)
        response.set_cookie('refresh_token', 'mock_refresh_token', max_age=2592000)
        
        return response
        
    except Exception as e:
        return jsonify({'error': 'Ошибка сервера'}), 500

@app.route('/api/login', methods=['POST'])
def api_login():
    try:
        data = request.get_json()
        
        # Поиск пользователя
        user = None
        if data.get('login'):
            user = users_db.get(data['login'])
        elif data.get('email'):
            user = next((u for u in users_db.values() if u['email'] == data['email']), None)
        elif data.get('phone'):
            user = next((u for u in users_db.values() if u['tel'] == data['phone']), None)
        
        # Проверка пароля
        if user and user['password'] == data.get('password'):
            response = jsonify({
                'message': 'Вход успешен',
                'access_expires_in': 3600,
                'refresh_expires_in': 2592000
            })
            
            # Устанавливаем куки
            response.set_cookie('access_token', 'mock_access_token', max_age=3600)
            response.set_cookie('refresh_token', 'mock_refresh_token', max_age=2592000)
            
            return response
        else:
            return jsonify({'error': 'Неверный логин или пароль'}), 401
            
    except Exception as e:
        return jsonify({'error': 'Ошибка сервера'}), 500

@app.route('/api/logout', methods=['POST'])
def api_logout():
    response = jsonify({'message': 'Выход успешен'})
    response.set_cookie('access_token', '', expires=0)
    response.set_cookie('refresh_token', '', expires=0)
    return response

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)