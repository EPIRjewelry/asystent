# Skrypt do wdrażania wszystkich serwisów Cloudflare i rozszerzeń Shopify
# Upewnij się, że jesteś zalogowany w `wrangler` i `shopify` CLI.

function Write-Host-Section {
    param(
        [string]$Message
    )
    Write-Host " "
    Write-Host "=================================================="
    Write-Host "[DEPLOY] $Message"
    Write-Host "=================================================="
    Write-Host " "
}

# --- DEPLOY CLOUDFLARE WORKERS ---

# Kolejność jest ważna ze względu na zależności (service bindings)
$services = @(
    "brain-service",
    "web-pixel-ingestor",
    "analytics-api",
    "customer-dialogue",
    "gateway"
)

foreach ($service in $services) {
    Write-Host-Section "Deploying Cloudflare Worker: $service"
    Push-Location "./services/$service"
    
    try {
        wrangler deploy
        if ($LASTEXITCODE -ne 0) {
            throw "Wrangler deploy failed for $service"
        }
    }
    catch {
        Write-Host "##[error] An error occurred during deployment of $service. Script will terminate."
        # Exit the script with a non-zero exit code
        exit 1
    }
    finally {
        Pop-Location
    }
}

# --- DEPLOY SHOPIFY EXTENSIONS ---

Write-Host-Section "Deploying Shopify App and Extensions"
try {
    # Ta komenda wdroży wszystkie rozszerzenia zdefiniowane w aplikacji
    shopify app deploy
    if ($LASTEXITCODE -ne 0) {
        throw "Shopify app deploy failed"
    }
}
catch {
    Write-Host "##[error] An error occurred during Shopify App deployment. Script will terminate."
    exit 1
}

Write-Host-Section "All services and extensions deployed successfully!"
