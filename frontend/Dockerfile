FROM node:24-alpine AS development
WORKDIR /app
COPY package*.json ./
# Lifecycle scripts stay off: no dependency needs one, and they are how a compromised package runs.
RUN npm ci --ignore-scripts
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM development AS build
# The release the browser reports with client errors; the deploy workflow passes the git sha.
ARG VITE_RELEASE_VERSION=development
ENV VITE_RELEASE_VERSION=$VITE_RELEASE_VERSION
RUN npm run build

FROM nginx:1.29-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

