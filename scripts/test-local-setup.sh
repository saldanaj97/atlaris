#!/bin/bash
set -e

ACTION=${1:-"up"}
COMPOSE_FILE="docker-compose.test.yml"

case "$ACTION" in
  up)
    echo "Starting local test database..."
    docker-compose -f "$COMPOSE_FILE" up -d
    echo "Waiting for database to be ready..."
    sleep 3
    echo "✓ Database is ready on localhost:54330"
    ;;
  down)
    echo "Stopping local test database..."
    docker-compose -f "$COMPOSE_FILE" down
    echo "✓ Database stopped"
    ;;
  logs)
    docker-compose -f "$COMPOSE_FILE" logs -f postgres
    ;;
  status)
    docker-compose -f "$COMPOSE_FILE" ps
    ;;
  *)
    echo "Usage: $0 {up|down|logs|status}"
    echo ""
    echo "Commands:"
    echo "  up     - Start the local test database container"
    echo "  down   - Stop and remove the test database container"
    echo "  logs   - View postgres container logs"
    echo "  status - Show container status"
    exit 1
    ;;
esac
