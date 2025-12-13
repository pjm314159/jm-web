```bash
cd JmWebProject
celery -A JmWebProject worker --loglevel=info --pool=threads
```
```bash
cd JmWebProject
python manage.py runserver 7000
```