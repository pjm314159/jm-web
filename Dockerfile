# Use an official Python runtime as the base image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=JmWebProject.settings

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gcc \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirement.txt /app/

# Install Python dependencies
RUN pip install --no-cache-dir -r requirement.txt

# Copy project
COPY . /app/

# Expose port
EXPOSE 8000

# Collect static files
RUN cd JmWebProject && python manage.py collectstatic --noinput

# Run migrations
RUN cd JmWebProject && python manage.py migrate

# Create superuser (optional - for development)
# RUN cd JmWebProject && echo "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.create_superuser('admin', 'admin@example.com', 'admin')" | python manage.py shell

# Run the application
CMD ["sh", "-c", "cd JmWebProject && python manage.py runserver 0.0.0.0:8000"]