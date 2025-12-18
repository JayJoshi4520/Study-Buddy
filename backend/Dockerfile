FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements separately to cache dependencies
COPY requirements.txt .

# Install dependencies
# IMPORTANT: Install CPU-only torch first to avoid downloading huge GPU libs
# This saves ~700MB+ in image size
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port (Render sets PORT env, but 8000 is our default)
ENV PORT=8000
EXPOSE 8000

# Run command
CMD ["sh", "-c", "python main.py"]
