# how to setup
### Begin
```bash
git clone https://github.com/pjm314159/jm-web
pip install -r requirement.txt
```
### First
migrations
```bash
cd JmWebProject
python manage.py makemigrations user 
python manage.py makemigrations comic
python manage.py migrate
```
### Second
run Redis
### Third
run Celery<br> 
first console
```bash
cd JmWebProject
celery -A JmWebProject worker --loglevel=info 
```
### Fourth
second console
```bash
cd JmWebProject
python manage.py runserver 
```