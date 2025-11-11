FROM ghcr.io/puppeteer/puppeteer:24.4.0

# These environment variables ensure puppeteer knows where to find Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETTER_EXECUTABLE_PATH=/user/bin/google-chrome-stable

# Set the working directory inside the container
WORKDIR /user/src/app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the project
COPY . .

# Verify Chrome is installed where we expect it
RUN ls -la /user/bin/google-chrome-stable || echo "Chrome no found at expected path"

# Compile Typescript before running
RUN npm run build

# Run the compiled app
CMD [ "node", "dist/index.js" ]