import { Audio } from 'expo-av'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { get, onChildAdded, onChildChanged, onChildRemoved, onValue, push, ref, set } from 'firebase/database'
import { useEffect, useRef, useState } from 'react'
import {
  Animated, FlatList,
  KeyboardAvoidingView, Linking, Modal, Platform,
  StyleSheet, Switch,
  Text, TextInput, TouchableOpacity,
  View
} from 'react-native'
import { auth, db } from '../firebase'

const CLOUDINARY_CLOUD = 'dujwxwpxo'
const CLOUDINARY_PRESET = 'firemes'

const THEMES = {
  light: {
    bg: '#e5ddd5', header: '#0088cc', headerText: 'white',
    authBg: 'white', title: '#0088cc', input: 'white',
    inputBorder: '#ccc', inputText: '#000', msgMine: '#dcf8c6',
    msgOther: 'white', msgText: '#000', nick: '#000', time: '#555',
    inputArea: 'white', placeholder: '#999', contactBg: 'white',
    contactText: '#000', contactSub: '#888', divider: '#eee',
    modalBg: 'white', sidebarBg: 'white', sidebarText: '#000',
    sidebarSub: '#888', settingsBg: '#f5f5f5', settingsItem: 'white',
  },
  dark: {
    bg: '#0d0d1a', header: '#1a1040', headerText: 'white',
    authBg: '#0d0d1a', title: '#a78bfa', input: '#1a1040',
    inputBorder: '#4c3a8a', inputText: 'white', msgMine: '#1e3a6e',
    msgOther: '#1a1040', msgText: 'white', nick: '#a78bfa', time: '#888',
    inputArea: '#0d0d1a', placeholder: '#6b5fa0', contactBg: '#0d0d1a',
    contactText: 'white', contactSub: '#6b5fa0', divider: '#1e1640',
    modalBg: '#1a1040', sidebarBg: '#110e2e', sidebarText: 'white',
    sidebarSub: '#6b5fa0', settingsBg: '#0d0d1a', settingsItem: '#1a1040',
  }
}

function getChatId(uid1, uid2) {
  return [uid1, uid2].sort().join('_')
}

async function uploadToCloudinary(uriOrFile, type = 'auto') {
  const formData = new FormData()
  if (Platform.OS === 'web') {
    formData.append('file', uriOrFile)
  } else {
    const filename = uriOrFile.split('/').pop()
    formData.append('file', { uri: uriOrFile, name: filename, type: 'application/octet-stream' })
  }
  formData.append('upload_preset', CLOUDINARY_PRESET)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/auto/upload`, {
    method: 'POST', body: formData
  })
  const data = await res.json()
  return data.secure_url
}

// Компонент аватарки
function Avatar({ url, letter, size = 44, onPress }) {
  const style = {
    width: size, height: size, borderRadius: size / 2,
    backgroundColor: '#0088cc', justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden'
  }
  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress} style={style}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: size * 0.4 }}>
          {letter?.toUpperCase()}
        </Text>
      )}
    </TouchableOpacity>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [userNick, setUserNick] = useState('')
  const [userAvatar, setUserAvatar] = useState(null)
  const [isDark, setIsDark] = useState(false)
  const [screen, setScreen] = useState('auth')

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sidebarAnim = useRef(new Animated.Value(-280)).current

  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)

  const [contacts, setContacts] = useState([])
  const [selectedContact, setSelectedContact] = useState(null)

  const [addModal, setAddModal] = useState(false)
  const [searchNick, setSearchNick] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searchError, setSearchError] = useState('')

  const [newNick, setNewNick] = useState('')
  const [notifications, setNotifications] = useState(true)
  const [avatarUploading, setAvatarUploading] = useState(false)

  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const flatListRef = useRef()

  const [recording, setRecording] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [playingSound, setPlayingSound] = useState(null)
  const [uploading, setUploading] = useState(false)

  const t = isDark ? THEMES.dark : THEMES.light

  function openSidebar() {
    setSidebarOpen(true)
    Animated.timing(sidebarAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start()
  }

  function closeSidebar() {
    Animated.timing(sidebarAnim, { toValue: -280, duration: 250, useNativeDriver: true }).start(() => setSidebarOpen(false))
  }

  useEffect(() => {
    return auth.onAuthStateChanged(async u => {
      if (u) {
        setUser(u)
        const snap = await new Promise(res => onValue(ref(db, 'users/' + u.uid), res, { onlyOnce: true }))
        const data = snap.val() || {}
        const nick = data.nickname || 'User'
        setUserNick(nick)
        setNewNick(nick)
        setUserAvatar(data.avatar || null)
        setScreen('contacts')
      } else {
        setUser(null)
        setScreen('auth')
      }
    })
  }, [])

  useEffect(() => {
    if (!user) return
    const unsub = onValue(ref(db, 'contacts/' + user.uid), async snap => {
      const data = snap.val() || {}
      const uids = Object.keys(data)
      const list = await Promise.all(uids.map(async uid => {
        const s = await get(ref(db, 'users/' + uid))
        return { uid, nickname: s.val()?.nickname || 'Unknown', avatar: s.val()?.avatar || null }
      }))
      setContacts(list)
    })
    return () => unsub()
  }, [user])

  useEffect(() => {
    if (!user || !selectedContact) return
    setMessages([])
    const chatId = getChatId(user.uid, selectedContact.uid)
    const msgsRef = ref(db, 'chats/' + chatId)
    const unsubAdded = onChildAdded(msgsRef, snap => {
      setMessages(prev => [...prev, { key: snap.key, ...snap.val() }])
    })
    const unsubChanged = onChildChanged(msgsRef, snap => {
      setMessages(prev => prev.map(m => m.key === snap.key ? { key: snap.key, ...snap.val() } : m))
    })
    const unsubRemoved = onChildRemoved(msgsRef, snap => {
      setMessages(prev => prev.filter(m => m.key !== snap.key))
    })
    return () => { unsubAdded(); unsubChanged(); unsubRemoved() }
  }, [user, selectedContact])

  async function register() {
    if (!email || !nickname || !password) return
    const u = await createUserWithEmailAndPassword(auth, email, password)
    await set(ref(db, 'users/' + u.user.uid), { nickname })
  }

  async function login() {
    if (!email || !password) return
    await signInWithEmailAndPassword(auth, email, password)
  }

  async function sendMessage() {
    if (!text.trim() || !selectedContact) return
    const chatId = getChatId(user.uid, selectedContact.uid)
    await push(ref(db, 'chats/' + chatId), {
      user: userNick, uid: user.uid,
      text: text.trim(), type: 'text', timestamp: Date.now()
    })
    setText('')
  }

  // Смена аватарки
  async function changeAvatar() {
    if (Platform.OS === 'web') {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        setAvatarUploading(true)
        try {
          const url = await uploadToCloudinary(file)
          await set(ref(db, 'users/' + user.uid + '/avatar'), url)
          setUserAvatar(url)
        } catch (e) { console.error(e) }
        setAvatarUploading(false)
      }
      input.click()
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8
    })
    if (result.canceled) return
    setAvatarUploading(true)
    try {
      const url = await uploadToCloudinary(result.assets[0].uri)
      await set(ref(db, 'users/' + user.uid + '/avatar'), url)
      setUserAvatar(url)
    } catch (e) { console.error(e) }
    setAvatarUploading(false)
  }

  async function pickAndSendFile() {
    if (Platform.OS === 'web') {
      const input = document.createElement('input')
      input.type = 'file'
      input.onchange = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        setUploading(true)
        try {
          const url = await uploadToCloudinary(file)
          const chatId = getChatId(user.uid, selectedContact.uid)
          await push(ref(db, 'chats/' + chatId), {
            user: userNick, uid: user.uid,
            text: file.name, fileUrl: url,
            type: file.type.startsWith('image/') ? 'image' : 'file',
            timestamp: Date.now()
          })
        } catch (e) { console.error(e) }
        setUploading(false)
      }
      input.click()
      return
    }
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*' })
    if (result.canceled) return
    const file = result.assets[0]
    setUploading(true)
    try {
      const url = await uploadToCloudinary(file.uri)
      const chatId = getChatId(user.uid, selectedContact.uid)
      await push(ref(db, 'chats/' + chatId), {
        user: userNick, uid: user.uid,
        text: file.name, fileUrl: url,
        type: 'file', timestamp: Date.now()
      })
    } catch (e) { console.error(e) }
    setUploading(false)
  }

  async function startRecording() {
    if (Platform.OS === 'web') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mediaRecorder = new MediaRecorder(stream)
        const chunks = []
        mediaRecorder.ondataavailable = e => chunks.push(e.data)
        mediaRecorder.onstop = async () => {
          const blob = new Blob(chunks, { type: 'audio/webm' })
          const file = new File([blob], 'voice.webm', { type: 'audio/webm' })
          setUploading(true)
          try {
            const url = await uploadToCloudinary(file)
            const chatId = getChatId(user.uid, selectedContact.uid)
            await push(ref(db, 'chats/' + chatId), {
              user: userNick, uid: user.uid,
              audioUrl: url, type: 'audio', timestamp: Date.now()
            })
          } catch (e) { console.error(e) }
          setUploading(false)
          stream.getTracks().forEach(t => t.stop())
        }
        mediaRecorder.start()
        setRecording(mediaRecorder)
        setIsRecording(true)
      } catch (e) { console.error(e) }
      return
    }
    await Audio.requestPermissionsAsync()
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
    setRecording(recording)
    setIsRecording(true)
  }

  async function stopAndSendRecording() {
    setIsRecording(false)
    if (Platform.OS === 'web') {
      recording.stop()
      setRecording(null)
      return
    }
    await recording.stopAndUnloadAsync()
    const uri = recording.getURI()
    setRecording(null)
    setUploading(true)
    try {
      const url = await uploadToCloudinary(uri, 'video')
      const chatId = getChatId(user.uid, selectedContact.uid)
      await push(ref(db, 'chats/' + chatId), {
        user: userNick, uid: user.uid,
        audioUrl: url, type: 'audio', timestamp: Date.now()
      })
    } catch (e) { console.error(e) }
    setUploading(false)
  }

  async function playAudio(url) {
    if (Platform.OS === 'web') {
      const audio = new window.Audio(url)
      audio.play()
      return
    }
    if (playingSound) {
      await playingSound.unloadAsync()
      setPlayingSound(null)
      return
    }
    const { sound } = await Audio.Sound.createAsync({ uri: url })
    setPlayingSound(sound)
    await sound.playAsync()
    sound.setOnPlaybackStatusUpdate(status => {
      if (status.didJustFinish) { sound.unloadAsync(); setPlayingSound(null) }
    })
  }

  async function searchUser() {
    setSearchError('')
    setSearchResult(null)
    if (!searchNick.trim()) return
    const snap = await get(ref(db, 'users'))
    const data = snap.val() || {}
    const found = Object.entries(data).find(
      ([uid, val]) => val.nickname?.toLowerCase() === searchNick.trim().toLowerCase() && uid !== user.uid
    )
    if (found) {
      setSearchResult({ uid: found[0], nickname: found[1].nickname, avatar: found[1].avatar || null })
    } else {
      setSearchError('Пользователь не найден 😔')
    }
  }

  async function addContact() {
    if (!searchResult) return
    await set(ref(db, 'contacts/' + user.uid + '/' + searchResult.uid), true)
    setAddModal(false)
    setSearchNick('')
    setSearchResult(null)
  }

  async function saveNickname() {
    if (!newNick.trim() || !user) return
    await set(ref(db, 'users/' + user.uid + '/nickname'), newNick.trim())
    setUserNick(newNick.trim())
  }

  function renderMessage({ item }) {
    const isMine = user && item.uid === user.uid
    return (
      <View style={[s.message,
        isMine ? { backgroundColor: t.msgMine, alignSelf: 'flex-end' }
               : { backgroundColor: t.msgOther, alignSelf: 'flex-start' }
      ]}>
        {item.type === 'audio' ? (
          <TouchableOpacity style={s.audioMsg} onPress={() => playAudio(item.audioUrl)}>
            <Text style={{ fontSize: 24 }}>▶</Text>
            <Text style={[s.audioLabel, { color: t.msgText }]}>Голосовое сообщение</Text>
          </TouchableOpacity>
        ) : item.type === 'image' ? (
          <TouchableOpacity onPress={() => Linking.openURL(item.fileUrl)}>
            <Image source={{ uri: item.fileUrl }} style={s.msgImage} contentFit="cover" />
          </TouchableOpacity>
        ) : item.type === 'file' ? (
          <TouchableOpacity onPress={() => Linking.openURL(item.fileUrl)}>
            <Text style={{ fontSize: 20 }}>📎</Text>
            <Text style={{ color: '#0088cc', textDecorationLine: 'underline' }}>{item.text}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ color: t.msgText }}>{item.text}</Text>
        )}
        <Text style={[s.time, { color: t.time }]}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
      </View>
    )
  }

  const Sidebar = () => (
    <>
      <TouchableOpacity style={s.sidebarOverlay} onPress={closeSidebar} activeOpacity={1} />
      <Animated.View style={[s.sidebar, { backgroundColor: t.sidebarBg, transform: [{ translateX: sidebarAnim }] }]}>
        <View style={[s.sidebarProfile, { backgroundColor: t.header }]}>
          <Avatar url={userAvatar} letter={userNick[0]} size={60} />
          <Text style={s.sidebarNick}>{userNick}</Text>
          <Text style={s.sidebarEmail}>{user?.email}</Text>
        </View>
        <TouchableOpacity style={s.sidebarItem} onPress={() => { closeSidebar(); setScreen('contacts') }}>
          <Text style={s.sidebarIcon}>💬</Text>
          <Text style={[s.sidebarItemText, { color: t.sidebarText }]}>Чаты</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.sidebarItem} onPress={() => { closeSidebar(); setScreen('settings') }}>
          <Text style={s.sidebarIcon}>⚙️</Text>
          <Text style={[s.sidebarItemText, { color: t.sidebarText }]}>Настройки</Text>
        </TouchableOpacity>
        <View style={[s.sidebarDivider, { backgroundColor: t.divider }]} />
        <TouchableOpacity style={s.sidebarItem} onPress={() => { closeSidebar(); auth.signOut() }}>
          <Text style={s.sidebarIcon}>🚪</Text>
          <Text style={[s.sidebarItemText, { color: 'red' }]}>Выйти</Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  )

  if (screen === 'auth') return (
    <View style={[s.auth, { backgroundColor: t.authBg }]}>
      <Text style={[s.title, { color: t.title }]}>🔥 FireMes(beta)</Text>
      <TextInput
        style={[s.input, { backgroundColor: t.input, borderColor: t.inputBorder, color: t.inputText }]}
        placeholder="Почта" placeholderTextColor={t.placeholder}
        value={email} onChangeText={setEmail}
        keyboardType="email-address" autoCapitalize="none"
      />
      {isRegister && (
        <TextInput
          style={[s.input, { backgroundColor: t.input, borderColor: t.inputBorder, color: t.inputText }]}
          placeholder="Никнейм" placeholderTextColor={t.placeholder}
          value={nickname} onChangeText={setNickname}
        />
      )}
      <TextInput
        style={[s.input, { backgroundColor: t.input, borderColor: t.inputBorder, color: t.inputText }]}
        placeholder="Пароль" placeholderTextColor={t.placeholder}
        value={password} onChangeText={setPassword} secureTextEntry
      />
      {isRegister ? (
        <>
          <TouchableOpacity style={s.btn} onPress={register}>
            <Text style={s.btnText}>Зарегистрироваться</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsRegister(false)}>
            <Text style={[s.switchText, { color: t.title }]}>Уже есть аккаунт? Войти</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity style={s.btn} onPress={login}>
            <Text style={s.btnText}>Войти</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsRegister(true)}>
            <Text style={[s.switchText, { color: t.title }]}>Нет аккаунта? Зарегистрироваться</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  )

  if (screen === 'settings') return (
    <View style={[s.container, { backgroundColor: t.settingsBg }]}>
      <View style={[s.header, { backgroundColor: t.header }]}>
        <TouchableOpacity onPress={openSidebar}>
          <Text style={{ fontSize: 22, color: 'white' }}>☰</Text>
        </TouchableOpacity>
        <Text style={[s.headerText, { color: t.headerText, flex: 1, marginLeft: 12 }]}>Настройки</Text>
      </View>

      <View style={s.settingsProfile}>
        <View>
          <Avatar url={userAvatar} letter={userNick[0]} size={80} onPress={changeAvatar} />
          <View style={s.avatarEditBadge}>
            <Text style={{ color: 'white', fontSize: 12 }}>✎</Text>
          </View>
        </View>
        {avatarUploading && <Text style={{ color: t.contactSub, marginTop: 8 }}>Загрузка...</Text>}
        <Text style={[s.settingsNick, { color: t.contactText }]}>{userNick}</Text>
        <Text style={[s.settingsEmail, { color: t.contactSub }]}>{user?.email}</Text>
      </View>

      <View style={[s.settingsSection, { backgroundColor: t.settingsItem }]}>
        <Text style={[s.settingsSectionTitle, { color: t.contactSub }]}>ПРОФИЛЬ</Text>
        <View style={s.settingsRow}>
          <TextInput
            style={[s.settingsInput, { color: t.inputText, borderColor: t.inputBorder }]}
            value={newNick} onChangeText={setNewNick}
            placeholder="Новый никнейм" placeholderTextColor={t.placeholder}
          />
          <TouchableOpacity style={s.settingsSaveBtn} onPress={saveNickname}>
            <Text style={{ color: 'white', fontWeight: 'bold' }}>Сохранить</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={[s.settingsSection, { backgroundColor: t.settingsItem, marginTop: 12 }]}>
        <Text style={[s.settingsSectionTitle, { color: t.contactSub }]}>ВНЕШНИЙ ВИД</Text>
        <View style={s.settingsToggleRow}>
          <Text style={[s.settingsToggleText, { color: t.contactText }]}>🌙 Тёмная тема</Text>
          <Switch value={isDark} onValueChange={setIsDark} trackColor={{ false: '#ccc', true: '#a78bfa' }} thumbColor='#ffffff' />
        </View>
      </View>
      <View style={[s.settingsSection, { backgroundColor: t.settingsItem, marginTop: 12 }]}>
        <Text style={[s.settingsSectionTitle, { color: t.contactSub }]}>УВЕДОМЛЕНИЯ</Text>
        <View style={s.settingsToggleRow}>
          <Text style={[s.settingsToggleText, { color: t.contactText }]}>🔔 Уведомления</Text>
          <Switch value={notifications} onValueChange={setNotifications} trackColor={{ false: '#ccc', true: '#a78bfa' }} thumbColor='#ffffff' />
        </View>
      </View>
      {sidebarOpen && <Sidebar />}
    </View>
  )

  if (screen === 'contacts') return (
    <View style={[s.container, { backgroundColor: t.bg }]}>
      <View style={[s.header, { backgroundColor: t.header }]}>
        <TouchableOpacity onPress={openSidebar}>
          <Text style={{ fontSize: 22, color: 'white' }}>☰</Text>
        </TouchableOpacity>
        <Text style={[s.headerText, { color: t.headerText, flex: 1, marginLeft: 12 }]}>🔥 FireMes(beta)</Text>
        <TouchableOpacity onPress={() => setAddModal(true)}>
          <Text style={{ fontSize: 24, color: 'white' }}>➕</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={contacts}
        keyExtractor={c => c.uid}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: t.divider }} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.contact, { backgroundColor: t.contactBg }]}
            onPress={() => { setSelectedContact(item); setScreen('chat') }}
          >
            <Avatar url={item.avatar} letter={item.nickname[0]} size={44} />
            <View>
              <Text style={[s.contactName, { color: t.contactText }]}>{item.nickname}</Text>
              <Text style={[s.contactSub, { color: t.contactSub }]}>Нажми чтобы написать</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={[s.empty, { color: t.contactSub }]}>Нажми ➕ чтобы добавить контакт</Text>
        }
      />
      <Modal visible={addModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modal, { backgroundColor: t.modalBg }]}>
            <Text style={[s.modalTitle, { color: t.contactText }]}>Добавить контакт</Text>
            <TextInput
              style={[s.input, { backgroundColor: t.input, borderColor: t.inputBorder, color: t.inputText }]}
              placeholder="Никнейм" placeholderTextColor={t.placeholder}
              value={searchNick} onChangeText={setSearchNick}
            />
            <TouchableOpacity style={s.btn} onPress={searchUser}>
              <Text style={s.btnText}>Найти</Text>
            </TouchableOpacity>
            {searchError ? <Text style={s.error}>{searchError}</Text> : null}
            {searchResult ? (
              <View style={s.searchResult}>
                <Avatar url={searchResult.avatar} letter={searchResult.nickname[0]} size={44} />
                <Text style={[s.contactName, { color: t.contactText, flex: 1, marginLeft: 10 }]}>
                  {searchResult.nickname}
                </Text>
                <TouchableOpacity style={[s.btn, { paddingHorizontal: 16 }]} onPress={addContact}>
                  <Text style={s.btnText}>Добавить</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <TouchableOpacity onPress={() => { setAddModal(false); setSearchNick(''); setSearchResult(null); setSearchError('') }}>
              <Text style={[s.switchText, { color: t.contactSub, marginTop: 12 }]}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {sidebarOpen && <Sidebar />}
    </View>
  )

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: t.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.header, { backgroundColor: t.header }]}>
        <TouchableOpacity onPress={() => setScreen('contacts')}>
          <Text style={{ fontSize: 22, color: 'white' }}>←</Text>
        </TouchableOpacity>
        <Avatar url={selectedContact?.avatar} letter={selectedContact?.nickname[0]} size={36} />
        <Text style={[s.headerText, { color: t.headerText, flex: 1, marginLeft: 8 }]}>{selectedContact?.nickname}</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={m => m.key}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        renderItem={renderMessage}
      />

      {uploading && (
        <View style={s.uploadingBar}>
          <Text style={{ color: 'white' }}>⏳ Загрузка...</Text>
        </View>
      )}

      <View style={[s.inputArea, { backgroundColor: t.inputArea }]}>
        <TouchableOpacity onPress={pickAndSendFile} style={s.iconBtn}>
          <Text style={{ fontSize: 22 }}>📎</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={isRecording ? stopAndSendRecording : startRecording}
          style={[s.iconBtn, isRecording && { backgroundColor: 'red', borderRadius: 20 }]}
        >
          <Text style={{ fontSize: 22 }}>{isRecording ? '⏹' : '🎤'}</Text>
        </TouchableOpacity>
        <TextInput
          style={[s.msgInput, { borderColor: t.inputBorder, backgroundColor: t.input, color: t.inputText }]}
          value={text} onChangeText={setText}
          placeholder="Сообщение..." placeholderTextColor={t.placeholder}
        />
        <TouchableOpacity style={s.sendBtn} onPress={sendMessage}>
          <Text style={{ color: 'white', fontSize: 18 }}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  auth: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10 },
  btn: { backgroundColor: '#0088cc', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  btnText: { color: 'white', fontWeight: 'bold' },
  switchText: { textAlign: 'center', marginTop: 8, fontSize: 14 },
  header: { padding: 16, flexDirection: 'row', alignItems: 'center' },
  headerText: { fontSize: 18, fontWeight: 'bold' },
  contact: { flexDirection: 'row', padding: 14, alignItems: 'center', gap: 12 },
  contactName: { fontSize: 16, fontWeight: '500' },
  contactSub: { fontSize: 13, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 16 },
  message: { maxWidth: '70%', padding: 10, borderRadius: 12, margin: 4 },
  msgImage: { width: 200, height: 200, borderRadius: 8 },
  time: { fontSize: 11, opacity: 0.6, marginTop: 2 },
  inputArea: { flexDirection: 'row', padding: 10, gap: 6, alignItems: 'center' },
  iconBtn: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  msgInput: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, fontSize: 16, height: 44 },
  sendBtn: { width: 45, height: 45, borderRadius: 23, backgroundColor: '#0088cc', justifyContent: 'center', alignItems: 'center' },
  audioMsg: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  audioLabel: { fontSize: 14 },
  uploadingBar: { backgroundColor: '#0088cc', padding: 8, alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  searchResult: { flexDirection: 'row', alignItems: 'center', padding: 10, marginTop: 8 },
  error: { color: 'red', textAlign: 'center', marginTop: 8 },
  sidebarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 10 },
  sidebar: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 280, zIndex: 11, elevation: 10 },
  sidebarProfile: { padding: 20, paddingTop: 50, alignItems: 'flex-start' },
  sidebarNick: { color: 'white', fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  sidebarEmail: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  sidebarIcon: { fontSize: 22 },
  sidebarItemText: { fontSize: 16 },
  sidebarDivider: { height: 1, marginHorizontal: 16, marginVertical: 8 },
  settingsProfile: { alignItems: 'center', padding: 24 },
  settingsNick: { fontSize: 20, fontWeight: 'bold', marginTop: 8 },
  settingsEmail: { fontSize: 14, marginTop: 4 },
  settingsSection: { marginHorizontal: 0, paddingHorizontal: 16, paddingVertical: 12 },
  settingsSectionTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 12, letterSpacing: 1 },
  settingsRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  settingsInput: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10 },
  settingsSaveBtn: { backgroundColor: '#0088cc', padding: 10, borderRadius: 8 },
  settingsToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  settingsToggleText: { fontSize: 16 },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#0088cc', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0088cc', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  avatarLarge: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#0088cc', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  avatarLargeText: { color: 'white', fontWeight: 'bold', fontSize: 36 },
})