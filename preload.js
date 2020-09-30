// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const log = require('electron-log');
const os = require('os');
var validate = require('ip-validator');
fs = require('fs')
path = require('path')
NodeSSH = require('node-ssh').NodeSSH

var path, NodeSSH, ssh, fs
var elem_status
var auth_path = path.resolve(os.homedir(), 'AppData/Roaming', 'rulesABZ', 'auth');
var auth_ip, auth_username, auth_password
var host1_ip, host1_id
var host2_ip, host2_id

var host_count = 1;

ssh = new NodeSSH()

function one_host() {
  host_count = 1;
  document.getElementById('host2.text').style = "display: none;"
  document.getElementById('host1.text').style = "display: none;"
  document.getElementById('host1.id').style = "display: none;"
}

function two_host() {
  host_count = 2;
  document.getElementById('host2.text').style = ""
  document.getElementById('host1.text').style = ""
  document.getElementById('host1.id').style = ""
}

function error(err) {
  elem_status = document.getElementById('status')
  var str = 'Ошибка: '

  switch(err) {
    case 'auth_ip_empty':
      str += 'IP Virtualbox не заполнен'
    break;

    case 'auth_ip_incorrect':
      str += 'IP Virtualbox некоректен'
    break;

    case 'auth_username_empty':
      str += 'имя пользователя Virtualbox не заполнено'
    break;

    case 'auth_password_empty':
      str += 'пароль Virtualbox не заполнен'
    break;
  }

  elem_status.innerHTML = str
}

function clear_error() {
  document.getElementById('status').innerHTML = ""
}

function auth_check() {
  auth_ip = document.getElementById('auth.ip').value
  auth_username = document.getElementById('auth.username').value
  auth_password = document.getElementById('auth.password').value

  if (auth_ip) {
    if (!validate.ipv4(auth_ip)) {
      error('auth_ip_incorrect');
      return 'error'
    }
  } else {
    error('auth_ip_empty')
    return 'error'
  }

  if (!auth_username) {
    error('auth_username_empty')
    return 'error'
  }

  if (!auth_password) {
    error('auth_password_empty')
    return 'error'
  }

  clear_error()
  return 'OK'
}

function host1_load(){
  host1_ip = document.getElementById('host1.ip').value
  host1_id = document.getElementById('host1.id').value
}

function host2_load(){
  host2_ip = document.getElementById('host2.ip').value
  host2_id = document.getElementById('host2.id').value
}

function drop_iptables(ip){
  return 'iptables -I FORWARD -s '+ip+' -p udp --dport 27000:27200 --match string --algo kmp --string \'steamid:\' -j DROP'
}

function accept_iptables(ip, id){
  return 'iptables -I FORWARD -s '+ip+' -p udp --dport 27000:27200 --match string --algo kmp --string \''+id+'\' -j ACCEPT'
}

function prepare_host(HOST1_IP, HOST2_ID) {
  var input_id = document.getElementById('users').value.split('\n')
      input_id.unshift(HOST2_ID)
      
  var result = drop_iptables(HOST1_IP) + ' && '

  log.info('PREPARE HOST IP: '+HOST1_IP+' ID: '+HOST2_ID);
  for (var count = 0; count < input_id.length; count++) {
    if (input_id[count] != '') {
      result += accept_iptables(HOST1_IP, input_id[count]) + ' && '
      log.info('id '+count+':'+input_id[count]);
    }
  }

  return result.slice(0, -4)  
}

function prepare_hosts() {
  return prepare_host(host1_ip, host2_id) + ' && ' +  prepare_host(host2_ip, host1_id)
}

function update(){
  if (auth_check() == 'OK') {
    auth_save(auth_ip, auth_username, auth_password);

    document.getElementById('status').innerHTML = 'Статус: обновление правил'

    var remove = 'count=$(iptables -L | grep "27000:27200" | wc -l)\nfor ((i = 0; i < count; i++))\ndo\niptables -D FORWARD 1\ndone'
    var iptables

    host1_load()
    host2_load()

    if(host_count == 1){
      iptables = prepare_host(host1_ip, host2_id)
    } else {
      iptables = prepare_hosts()
    }

    var ssh_cwd = '/home/' + auth_username
    var update_cmd = 'echo \"'+auth_password+'\" | sudo -S bash -c \"'+'echo '+btoa(remove+'\n'+iptables)+' | base64 --decode | bash'+'\"'

    log.info('UPDATE: '+ update_cmd);

    console.log(update_cmd)
    ssh.connect({
      host: auth_ip,
      username: auth_username,
      password: auth_password
    }).then(function() {
      ssh.execCommand(update_cmd, { cwd:ssh_cwd }).then(function(result) {
        log.info('UPDATE STDOUT:\n' + result.stdout);
        log.info('UPDATE STDERR:\n' + result.stderr);
        document.getElementById('status').innerHTML = 'Статус: правила обновлены'
      })
    })
  }
}

function remove() {
  if (auth_check() == 'OK') {
    auth_save(auth_ip, auth_username, auth_password);

    document.getElementById('status').innerHTML = 'Статус: удаление правил'

    var command = btoa('count=$(iptables -L | grep "27000:27200" | wc -l)\nfor ((i = 0; i < count; i++))\ndo\niptables -D FORWARD 1\ndone')

    var ssh_cwd = '/home/' + auth_username
    var ssh_root = 'echo \"'+auth_password+'\" | sudo -S bash -c \"'+'echo '+command+' | base64 --decode | bash'+'\"'

    ssh.connect({
      host: auth_ip,
      username: auth_username,
      password: auth_password
    }).then(function() {
      ssh.execCommand(ssh_root, { cwd:ssh_cwd }).then(function(result) {
        log.info('REMOVE STDOUT:\n' + result.stdout);
        log.info('REMOVE STDERR:\n' + result.stderr);
        document.getElementById('status').innerHTML = 'Статус: правила удалены'
      })
    })
  }
}

function auth_save(ip, username, password){
  fs.writeFileSync(auth_path, ip+';'+username+';'+password)
}

function auth_read(){
  if (fs.existsSync(auth_path)) {
    var data = fs.readFileSync(auth_path, "utf8").split(';');
    document.getElementById('auth.ip').value = data[0]
    document.getElementById('auth.username').value = data[1]
    document.getElementById('auth.password').value = data[2]
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type])
  }

  log.info('START rulesABZ');

  auth_read()

  document.getElementById('version').innerHTML = 'v0.0.6'
  document.getElementById('update').addEventListener("click", update);
  document.getElementById('remove').addEventListener("click", remove);
  document.getElementById('one.pc').addEventListener("click", one_host);
  document.getElementById('two.pc').addEventListener("click", two_host);
})