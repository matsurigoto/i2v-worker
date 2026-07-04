// Azure infrastructure for the i2v-worker platform.
//
// Provisions:
//  - Storage Account (Blob containers for images/videos, Queue for job messages)
//  - Azure Database for PostgreSQL Flexible Server (Burstable B1ms)
//  - App Service Plan (Linux) + App Service for the API
//  - Container Apps Environment + Container App for the worker
//  - Static Web App for the web frontend
//
// This is intentionally a minimal, low-cost starting point (see
// docs/architecture.md for the cost estimate). Scale up SKUs as needed.

@description('Short name used as a prefix for all resources, e.g. "i2v".')
param namePrefix string = 'i2v'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Administrator username for PostgreSQL.')
param dbAdminUsername string = 'i2vadmin'

@secure()
@description('Administrator password for PostgreSQL.')
param dbAdminPassword string

@description('Container image for the worker, e.g. myregistry.azurecr.io/i2v-worker:latest')
param workerContainerImage string

@secure()
@description('JWT secret for signing session tokens. Must be a long random string in production.')
param jwtSecret string

@description('Auth username for the single admin account.')
param authUsername string = 'admin'

@secure()
@description('bcrypt hash of the auth password. Generate with: node -e "console.log(require(\'bcryptjs\').hashSync(\'yourpassword\', 10))"')
param authPasswordHash string

@description('Hostname of the Static Web App frontend (e.g. "wonderful-desert-0abc1.azurestaticapps.net"). Used to configure CORS on the API.')
param webAppHostname string = ''

var storageAccountName = toLower('${namePrefix}sa${uniqueString(resourceGroup().id)}')
var dbServerName = '${namePrefix}-psql-${uniqueString(resourceGroup().id)}'
var appServicePlanName = '${namePrefix}-plan'
var apiAppName = '${namePrefix}-api-${uniqueString(resourceGroup().id)}'
var containerAppsEnvName = '${namePrefix}-cae'
var workerAppName = '${namePrefix}-worker'
var staticWebAppName = '${namePrefix}-web'

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storage
  name: 'default'
}

resource mediaContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'media'
  properties: {
    publicAccess: 'None'
  }
}

resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-01-01' = {
  parent: storage
  name: 'default'
}

resource videoJobsQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = {
  parent: queueService
  name: 'video-jobs'
}

resource dbServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: dbServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: dbAdminUsername
    administratorLoginPassword: dbAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
  }
}

resource dbFirewallAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: dbServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource dbDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: dbServer
  name: 'i2v'
}

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource apiApp 'Microsoft.Web/sites@2023-12-01' = {
  name: apiAppName
  location: location
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      appSettings: [
        { name: 'DATABASE_URL', value: 'postgresql://${dbAdminUsername}:${dbAdminPassword}@${dbServer.properties.fullyQualifiedDomainName}:5432/i2v' }
        { name: 'STORAGE_DRIVER', value: 'azure-blob' }
        { name: 'AZURE_STORAGE_CONNECTION_STRING', value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=core.windows.net' }
        { name: 'AZURE_STORAGE_CONTAINER_NAME', value: 'media' }
        { name: 'AZURE_STORAGE_QUEUE_NAME', value: 'video-jobs' }
        { name: 'WEBSITES_PORT', value: '4000' }
        { name: 'NODE_ENV', value: 'production' }
        { name: 'CORS_ORIGIN', value: webAppHostname != '' ? 'https://${webAppHostname}' : 'https://${staticWebApp.properties.defaultHostname}' }
        { name: 'JWT_SECRET', value: jwtSecret }
        { name: 'AUTH_USERNAME', value: authUsername }
        { name: 'AUTH_PASSWORD_HASH', value: authPasswordHash }
      ]
    }
  }
}

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvName
  location: location
  properties: {}
}

resource workerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: workerAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: workerContainerImage
          env: [
            { name: 'DATABASE_URL', value: 'postgresql://${dbAdminUsername}:${dbAdminPassword}@${dbServer.properties.fullyQualifiedDomainName}:5432/i2v' }
            { name: 'STORAGE_DRIVER', value: 'azure-blob' }
            { name: 'AZURE_STORAGE_CONNECTION_STRING', value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=core.windows.net' }
            { name: 'AZURE_STORAGE_CONTAINER_NAME', value: 'media' }
            { name: 'AZURE_STORAGE_QUEUE_NAME', value: 'video-jobs' }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
      }
    }
  }
}

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

output apiAppName string = apiApp.name
output apiAppHostName string = apiApp.properties.defaultHostName
output staticWebAppHostName string = staticWebApp.properties.defaultHostname
output storageAccountName string = storage.name
output dbServerFqdn string = dbServer.properties.fullyQualifiedDomainName
