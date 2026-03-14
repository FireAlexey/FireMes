import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: "AIzaSyDG73X9enVcN1jJCrvtF9od8cCStMgODGQ",
  authDomain: "firemes-f3a38.firebaseapp.com",
  databaseURL: "https://firemes-f3a38-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "firemes-f3a38",
  storageBucket: "firemes-f3a38.firebasestorage.app",
  messagingSenderId: "759189412930",
  appId: "1:759189412930:web:e355a5858a77f9359a61db"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getDatabase(app)