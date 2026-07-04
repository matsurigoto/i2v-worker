using './main.bicep'

param namePrefix = 'i2v'
param dbAdminUsername = 'i2vadmin'
param dbAdminPassword = '' // supply via --parameters dbAdminPassword=... at deploy time, never commit a real value
param workerContainerImage = 'ghcr.io/your-org/i2v-worker:latest'
