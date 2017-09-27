import Vue from 'vue';
import Vuex from 'vuex';
import axios from 'axios';

var d3 = require('d3');

Vue.use(Vuex);



const API_URL='http://localhost:5000/api/';

const modelDescriptors ={
  SI:{
    state_labels:{
      0:"Susceptible",
        1:"Infected"
    },
    nodeColor: d3.scale.category20()
      .domain([0,1])
    // .range(colorbrewer['RdYlBu'][3])
  },
  SIR:{
    state_labels:{
      0:"Susceptible",
        1:"Infected",
        2:"Recovered"
    },
    nodeColor: d3.scale.category20()
      .domain([0,1,2])
    // .range(colorbrewer['RdYlBu'][3])
  },
}


var instance = axios.create({
  baseURL: API_URL
})

function prepareRequestParameters(obj, injectToken){
  var params = new URLSearchParams();
  Object.keys(obj).forEach(function(k){
    params.append(k, obj[k])
  })

  return params;
}


export const store = new Vuex.Store({
  state:{
    token:'',
    availableModels:[],
    availableGenerators:[],
    describe:{},
    content:{
      network:{},
      models:[],
      iterations:{}
    },
    hasNetwork: false,
    hasModels: false
  },
  mutations:{
    setToken: function (state,token){
      state.token = token;
    },

    setNetworkGenerators: function (state, networks) {
      state.availableGenerators = networks;
    },

    setAvailableModels: function (state, models) {
      state.availableModels = models;
    },
    updateExperimentDescription: function(state, description){
      state.describe = description;
    },
    updateHasModels: function(state, status){
      state.hasModels = status;
    },
    updateNetwork: function(state, network){
      state.content.network = network;
      state.hasNetwork = true;
    },
    updateIterations: function(state, iterations){

      Object.entries(iterations).forEach(([modelName,values]) => {
        values.forEach(function(i){
          var ts = i.iteration;
          Object.keys(i.status).forEach(function(j){
            var node = state.content.network.nodes[j];
            var evtModel = node.events || (node.events = {});
            var evt = evtModel[modelName] || (evtModel[modelName] = []);
            evt.push({i:ts, s: i.status[j]});
          })
        })
      });

      // accumulate iterations in the store
      Object.keys(iterations).forEach(function(m){
        var iters = iterations[m];
        var prevs = state.content.iterations[m];
        if(!prevs) prevs = [];

        // I assume iterations are consecutive
        var join = prevs.concat(iters);
        state.content.iterations[m] = join;
      });

      // compute derived statistics from the stored iterations
      d3.keys(state.content.iterations).forEach(function(model){
        var numIterations = state.content.iterations[model].length;
        var modelName = model.split("_")[0];
        var modelDescriptor  = modelDescriptors[modelName];
        console.log(modelDescriptor);
        var sums = {};
        d3.keys(modelDescriptor["state_labels"]).forEach(function(s){
          sums[s] = {
            label: modelDescriptor.state_labels[s],
            values: d3.range(numIterations).map(function(){return 0})
          }
        });
        state.content.network.nodes.filter(function(n,i){return true})
          .forEach(function(n,i){
            n.events[model].forEach(function(e,j){
              var nextPos = (j<n.events[model].length-1 ? n.events[model][j+1].i:numIterations);
              var segnode = d3.range(e.i, nextPos);
              // console.log(e.s,segnode);
              segnode.forEach(function(p){
                sums[e.s].values[p]++;
              })
            })
          });
        // var mv = app.modelViewers[model];
        // mv.trendData(sums);
        console.log("mv",sums);
      })



    }
  },
  actions:{
    loadNetworkGeneratorEndpoints: function (context) {
      instance.get('Generators')
        .then(function(response){
          context.commit('setNetworkGenerators', response.data.endpoints);
        })
    },
    loadModelsEndpoints: function (context) {
      instance.get('Models')
        .then(function(response){
          context.commit('setAvailableModels', response.data.endpoints);
        })
    },
    loadExperimentDescrition: function(context) {
      var params = prepareRequestParameters({
        token:this.state.token
      });

      instance.post('ExperimentStatus', params)
        .then(function (response) {
          context.commit('updateExperimentDescription', response.data);
        })
    },


    /**
     * --------------------------------------------------
     *                    EXPERIMENTS
     * --------------------------------------------------
     */

    /**
     * Function to creare a new experiment
     *
     * @param context
     */
    createExperiment: function (context) {
      instance.get('Experiment')
        .then(response => {
          console.log(response);
          context.commit('setToken',response.data.token);
        })
    },
    /**
     * Destroy the current experiment
     *
     * @param context
     */
    destroyExperiment: function(context){
      var params = prepareRequestParameters({
        token: this.state.token
      })

      instance.delete('Experiment', params)
      .then(function(response){
        console.log(response);
      })
    },

    /**
     *  --------------------------------------------
     *     NETWORK GENERATORS
     *  --------------------------------------------
     */
    /**
     * Generate a new graph according to the specific configuration
     * Example of config format
     * {
     *  generator: 'ERGraph',
     *  params:{
     *    n:10,
     *    p:0.1,
     *    directed: false
     *  }
     * }
     * @param context
     * @param config
     */
    generateNetwork: function(context, config){
      config.params.token = this.state.token;
      var params = prepareRequestParameters(config.params);

      instance.put('Generators/'+config.generator, params)
        .then(function(response){
          if(response.status==200){
            // load network from the server
            instance.post('GetGraph', params).then(function(resp){
              console.log(resp);
              context.commit('updateNetwork',resp.data);
            })

          }
        })
        .catch(function(error){
          console.log(error);
        })
    },

    appendModel: function(context, config){
      config.params.token = this.state.token;
      var params = prepareRequestParameters(config.params);

      instance.put(''+config.model, params).then(function(response){
        console.log(response);
        if(response.status==200){
          // load network from the server
          instance.post('ExperimentStatus', params)
            .then(function (resp) {
              context.commit('updateExperimentDescription', resp.data);
            })

        }
      }).catch(function(error){
        console.log(error);
      })
    },

    iterate: function(context, config){
      config.token = this.state.token;
      var params = prepareRequestParameters(config);
      var method = (config.bunch ? 'IterationBunch' : 'Iteration');

      instance.post(method, params).then(function(response){
        console.log(response);
        context.commit('updateIterations', response.data);
      }).catch(function(error){
        console.log(error);
      })
    }
  },
  getters:{
    isNetworkEmpty: function (state) {
      return state.hasNetwork;
    },

    availableGenerators: function(state){
      return state.availableGenerators;
    },

    hasModels: function(state){
      return state.describe.Models && Object.keys(state.describe.Models).length
    },

    getNumNodes: function(state){
      return state.content.network.nodes?state.content.network.nodes.length : 0;
    },

    getNumEdges: function(state){
      return state.content.network.links? state.content.network.links.length : 0;
    },

    getNetwork: function(state){
      return state.content.network;
    },

    getModels: function(state){
      return state.describe.Models ? state.describe.Models:  {};
    }
  }
})
