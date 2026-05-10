FROM apify/actor-node:24

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install all deps including dev (for build) — this is the actor's runtime image,
# not a published image, so size is acceptable.
RUN npm install --include=dev --quiet \
 && npm prune --omit=dev \
 && echo "Installed npm packages:" && npm list --omit=dev || true

# Copy source + build the typescript output
COPY . ./
RUN npm run build

CMD npm run start --silent
