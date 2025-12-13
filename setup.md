# how to setup
### Begin
```bash
git clone 
pip install -r requirement.txt
```
### First
migrations
```bash
cd JmWebProjecr
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
celery -A JmWebProject worker --loglevel=info --pool=solo
```
### Fourth
second console
```bash
cd JmWebProject
python manage.py runserver 
```