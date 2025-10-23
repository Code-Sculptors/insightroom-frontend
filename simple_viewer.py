from flask import render_template, Flask
import os


app = Flask(__name__, template_folder=os.path.dirname(os.path.abspath(__file__)) + '/pages')
# !!!!!!!!!!!!!!!!! раскомментировать строку внизу если хочешь потестить страничку в new_pages и закомментировать строку сверху !!!!!!!!!!!!!!!!!!!!!!!!!!!
# app = Flask(__name__, template_folder=os.path.dirname(os.path.abspath(__file__)) + '/new pages')
print(app.template_folder)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/<file_name>')
def view(file_name: str):
    """Вводишь в ссылку имя файла, который лежит в pages (без .html) и он его тебе выводит"""
    if file_name == 'favicon.ico':
        with open(os.path.dirname(os.path.abspath(__file__)) + '/static/images/favicon.ico', mode='rb') as ico:
            ico = ico.read()
        return ico
    return render_template(file_name + '.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)
